/**
 * Integration tests for GET /movements/:id/my-history
 *
 * Covers:
 *   - 401 when unauthenticated
 *   - 404 for an unknown movement ID
 *   - Empty response when user has no results for the movement
 *   - Correct STRENGTH PR table from logged sets
 *   - Paginated past results in descending date order
 *
 * Requires: API running, DB accessible via DATABASE_URL.
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
let pass = 0
let fail = 0

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

async function api(method: string, path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

async function apiPost(path: string, token: string, body: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

const TS = Date.now()
let gymId = ''
let memberId = ''
let memberToken = ''
let movementId = ''
let workoutId = ''
let resultId = ''
let programId = ''
let backfillWorkoutId = ''

async function setup() {
  const gym = await prisma.gym.create({ data: { name: `MH-Gym-${TS}`, slug: `mh-gym-${TS}`, timezone: 'UTC' } })
  gymId = gym.id

  const member = await prisma.user.create({
    data: { name: `MH-Member-${TS}`, email: `mh-member-${TS}@test.com` },
  })
  memberId = member.id

  await prisma.userGym.create({ data: { userId: memberId, gymId, role: 'MEMBER' } })

  memberToken = signTokenPair(memberId, 'MEMBER').accessToken

  const movement = await prisma.movement.create({ data: { name: `MH-BackSquat-${TS}` } })
  movementId = movement.id

  const program = await prisma.program.create({
    data: { name: `MH-Prog-${TS}`, startDate: new Date('2026-01-01'), gyms: { create: { gymId } } },
  })
  programId = program.id

  const workout = await prisma.workout.create({
    data: {
      title: `MH-WOD-${TS}`,
      description: 'Back Squat 5-3-1',
      type: 'STRENGTH',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-01T00:00:00Z'),
      programId,
      workoutMovements: {
        create: [{ movementId, displayOrder: 0 }],
      },
    },
  })
  workoutId = workout.id

  // Log a result with two sets: 5 × 225 lb and 3 × 275 lb
  const result = await prisma.result.create({
    data: {
      userId: memberId,
      workoutId,
      level: 'RX',
      workoutGender: 'OPEN',
      primaryScoreKind: 'LOAD',
      primaryScoreValue: 275,
      value: {
        movementResults: [
          {
            workoutMovementId: movementId,
            loadUnit: 'LB',
            sets: [
              { reps: '5', load: 225 },
              { reps: '3', load: 275 },
            ],
          },
        ],
      },
    },
  })
  resultId = result.id
}

async function teardown() {
  await prisma.result.deleteMany({ where: { userId: memberId } })
  // Clean up any personal program created by the backfill test before deleting the user.
  // User.personalProgram has onDelete:Cascade, but workouts block the cascade, so we
  // must explicitly clear them first.
  const pp = await prisma.program.findUnique({ where: { ownerUserId: memberId } }).catch(() => null)
  if (pp) {
    await prisma.workout.deleteMany({ where: { programId: pp.id } }).catch(() => {})
    await prisma.program.delete({ where: { id: pp.id } }).catch(() => {})
  }
  await prisma.workout.deleteMany({ where: { id: workoutId } })
  await prisma.movement.deleteMany({ where: { id: movementId } })
  await prisma.userGym.deleteMany({ where: { gymId } })
  await prisma.user.deleteMany({ where: { id: memberId } })
  await prisma.gymProgram.deleteMany({ where: { gymId } }).catch(() => {})
  await prisma.program.deleteMany({ where: { id: programId } })
  await prisma.gym.deleteMany({ where: { id: gymId } })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testUnauthenticated() {
  console.log('\n401 when unauthenticated')
  const { status } = await api('GET', `/movements/${movementId}/my-history`)
  check('status 401', 401, status)
}

async function testUnknownMovement() {
  console.log('\n404 for unknown movement')
  const { status } = await api('GET', '/movements/nonexistent-id/my-history', memberToken)
  check('status 404', 404, status)
}

async function testEmptyHistory() {
  console.log('\nEmpty history for movement with no user results')
  const otherMovement = await prisma.movement.create({ data: { name: `MH-Other-${TS}` } })
  try {
    const { status, body } = await api('GET', `/movements/${otherMovement.id}/my-history`, memberToken)
    check('status 200', 200, status)
    const b = body as { total: number; results: unknown[] }
    check('total is 0', 0, b.total)
    check('results is empty', 0, b.results.length)
  } finally {
    await prisma.movement.delete({ where: { id: otherMovement.id } })
  }
}

async function testStrengthPrTable() {
  console.log('\nSTRENGTH PR table computed correctly')
  const { status, body } = await api('GET', `/movements/${movementId}/my-history`, memberToken)
  check('status 200', 200, status)
  const b = body as { category: string; prTable: { category: string; entries: Array<{ reps: number; maxLoad: number }> }; total: number; results: unknown[] }
  check('category is STRENGTH', 'STRENGTH', b.category)
  check('prTable.category is STRENGTH', 'STRENGTH', b.prTable.category)

  const byReps = new Map(b.prTable.entries.map((e) => [e.reps, e.maxLoad]))
  check('5RM maxLoad is 225', 225, byReps.get(5))
  check('3RM maxLoad is 275', 275, byReps.get(3))
}

async function testPaginatedResults() {
  console.log('\nPaginated past results')
  const { status, body } = await api('GET', `/movements/${movementId}/my-history?page=1&limit=5`, memberToken)
  check('status 200', 200, status)
  const b = body as { total: number; results: Array<{ id: string; workout: { id: string } }> }
  check('total is 1', 1, b.total)
  check('results has 1 entry', 1, b.results.length)
  check('result id matches', resultId, b.results[0]?.id)
  check('workout id matches', workoutId, b.results[0]?.workout.id)
}

async function testBackfillViaPersonalProgram() {
  console.log('\nBackfill via personal program — result appears in my-history and updates PR')

  // Create a personal program workout with the movement linked via movementIds
  const r1 = await apiPost('/me/personal-program/workouts', memberToken, {
    title: `MH-BackSquat-${TS} 5RM`,
    description: '5 × 315 lb',
    type: 'STRENGTH',
    scheduledAt: '2026-03-01T12:00:00.000Z',
    movementIds: [movementId],
  })
  check('create personal workout status 201', 201, r1.status)
  backfillWorkoutId = (r1.body as { id: string }).id

  // Log a result against the new workout
  const r2 = await apiPost(`/workouts/${backfillWorkoutId}/results`, memberToken, {
    level: 'RX',
    workoutGender: 'OPEN',
    value: {
      movementResults: [{
        workoutMovementId: movementId,
        loadUnit: 'LB',
        sets: [{ reps: '5', load: 315 }],
      }],
    },
  })
  check('log backfill result status 201', 201, r2.status)

  // Verify it appears in my-history total and updates the 5RM PR
  const r3 = await api('GET', `/movements/${movementId}/my-history`, memberToken)
  check('status 200 after backfill', 200, r3.status)
  const b = r3.body as {
    total: number
    results: Array<{ id: string; workout: { id: string } }>
    prTable: { entries: Array<{ reps: number; maxLoad: number }> }
  }
  check('total is now 2 (gym workout + backfill)', 2, b.total)
  const fiveRm = b.prTable.entries.find((e) => e.reps === 5)
  check('5RM PR updated to 315', 315, fiveRm?.maxLoad)
}

// ─── Runner ───────────────────────────────────────────────────────────────────

;(async () => {
  try {
    await setup()
    await testUnauthenticated()
    await testUnknownMovement()
    await testEmptyHistory()
    await testStrengthPrTable()
    await testPaginatedResults()
    await testBackfillViaPersonalProgram()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
})()
