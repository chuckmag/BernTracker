/**
 * Lightweight integration tests for workout CRUD & publish endpoints.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/workouts.ts
 *
 * Strategy: seed all fixtures directly via Prisma (no HTTP for setup),
 * sign tokens in-process, then drive assertions through the live API.
 * Teardown runs in a finally block so the DB stays clean on failure.
 */

import { prisma, ProgramRole } from '@berntracker/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = 'http://localhost:3000/api'
let pass = 0
let fail = 0

// ─── Helpers ──────────────────────────────────────────────────────────────────

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json as Record<string, unknown> }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let gymId = ''
let programId = ''
let workoutId = ''
let memberUserId = ''
let programmerUserId = ''
let memberToken = ''
let programmerToken = ''

async function setup() {
  console.log('\n=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `AT Gym ${TS}`, slug: `at-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const [memberUser, programmerUser] = await Promise.all([
    prisma.user.create({ data: { email: `at-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `at-programmer-${TS}@test.com` } }),
  ])
  memberUserId = memberUser.id
  programmerUserId = programmerUser.id

  // Give programmer gym-level write access so they can use the gym-scoped create route
  await prisma.userGym.create({ data: { userId: programmerUserId, gymId, role: 'PROGRAMMER' } })

  const program = await prisma.program.create({
    data: {
      name: `AT Program ${TS}`,
      startDate: new Date('2026-03-01'),
      gyms: { create: { gymId } },
      members: {
        createMany: {
          data: [
            { userId: memberUserId, role: ProgramRole.MEMBER },
            { userId: programmerUserId, role: ProgramRole.PROGRAMMER },
          ],
        },
      },
    },
  })
  programId = program.id

  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken
  programmerToken = signTokenPair(programmerUserId, 'PROGRAMMER').accessToken

  // Create the primary test workout via API (exercises gym-scoped POST)
  const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
    programId,
    title: 'AT Test Workout',
    description: 'Integration test workout',
    type: 'FOR_TIME',
    scheduledAt: '2026-03-15T10:00:00Z',
  })
  workoutId = r.body.id as string

  console.log(`  gym=${gymId}`)
  console.log(`  program=${programId}`)
  console.log(`  workout=${workoutId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── Gym-scoped routes ──────────────────────────────────────────────────────
  console.log('\n=== Gym-scoped routes ===')

  {
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: 'Extra Workout',
      description: 'desc',
      type: 'STRENGTH',
      scheduledAt: '2026-03-20T10:00:00Z',
    })
    check('POST /gyms/:gymId/workouts → 201', 201, r.status)
    check('POST /gyms/:gymId/workouts → status DRAFT', 'DRAFT', r.body.status)
    if (r.body.id) await prisma.workout.delete({ where: { id: r.body.id as string } })
  }

  {
    // Use a range that doesn't overlap the primary test workout (2026-03-15)
    const r = await api('POST', `/gyms/${gymId}/workouts/publish`, programmerToken, {
      from: '2026-03-20',
      to: '2026-03-31',
    })
    check('POST /gyms/:gymId/workouts/publish → 200', 200, r.status)
    check('POST /gyms/:gymId/workouts/publish → published is a number', true, typeof r.body.published === 'number')
  }

  {
    const r = await api('GET', `/gyms/${gymId}/workouts?from=2026-03-01&to=2026-03-31`, programmerToken)
    check('GET /gyms/:gymId/workouts → 200', 200, r.status)
    check('GET /gyms/:gymId/workouts → array', true, Array.isArray(r.body))
  }

  // ── Program-scoped read access ─────────────────────────────────────────────
  console.log('\n=== Program-scoped read access ===')

  {
    const r = await api('GET', `/workouts/${workoutId}`, memberToken)
    check('GET /workouts/:id as MEMBER subscriber → 200', 200, r.status)
  }

  {
    const r = await api('GET', `/workouts/${workoutId}`, programmerToken)
    check('GET /workouts/:id as PROGRAMMER subscriber → 200', 200, r.status)
  }

  {
    const other = await prisma.user.create({ data: { email: `at-other-${TS}@test.com` } })
    const otherToken = signTokenPair(other.id, 'MEMBER').accessToken
    const r = await api('GET', `/workouts/${workoutId}`, otherToken)
    check('GET /workouts/:id with no subscription → 403', 403, r.status)
    await prisma.user.delete({ where: { id: other.id } })
  }

  {
    const orphan = await prisma.workout.create({
      data: { title: 'Orphan', description: 'no program', type: 'CARDIO', scheduledAt: new Date() },
    })
    const r = await api('GET', `/workouts/${orphan.id}`, memberToken)
    check('GET /workouts/:id (programId=null) → 403', 403, r.status)
    await prisma.workout.delete({ where: { id: orphan.id } })
  }

  // ── Program-scoped write access ────────────────────────────────────────────
  console.log('\n=== Program-scoped write access ===')

  {
    const r = await api('PATCH', `/workouts/${workoutId}`, memberToken, { title: 'Should Fail' })
    check('PATCH /workouts/:id as MEMBER → 403', 403, r.status)
  }

  {
    const r = await api('PATCH', `/workouts/${workoutId}`, programmerToken, { title: 'Updated Title' })
    check('PATCH /workouts/:id as PROGRAMMER → 200', 200, r.status)
    check('PATCH /workouts/:id → title updated', 'Updated Title', r.body.title)
  }

  {
    const r = await api('POST', `/workouts/${workoutId}/publish`, programmerToken)
    check('POST /workouts/:id/publish as PROGRAMMER → 200', 200, r.status)
    check('POST /workouts/:id/publish → status PUBLISHED', 'PUBLISHED', r.body.status)
  }

  {
    const r = await api('POST', `/workouts/${workoutId}/publish`, programmerToken)
    check('POST /workouts/:id/publish (already published) → 409', 409, r.status)
  }

  {
    const deletedId = workoutId
    const r = await api('DELETE', `/workouts/${workoutId}`, programmerToken)
    check('DELETE /workouts/:id as PROGRAMMER → 204', 204, r.status)
    workoutId = '' // deleted — skip teardown for this one
    const r2 = await api('GET', `/workouts/${deletedId}`, programmerToken)
    check('GET /workouts/:id after delete → 404', 404, r2.status)
  }

  // ── Subscribe role ─────────────────────────────────────────────────────────
  console.log('\n=== Subscribe role ===')

  {
    const u = await prisma.user.create({ data: { email: `at-sub-prog-${TS}@test.com` } })
    const r = await api('POST', `/programs/${programId}/subscribe`, undefined, {
      userId: u.id,
      role: 'PROGRAMMER',
    })
    check('POST /programs/:id/subscribe role=PROGRAMMER → 201', 201, r.status)
    check('POST /programs/:id/subscribe → role=PROGRAMMER', 'PROGRAMMER', r.body.role)
    await prisma.user.delete({ where: { id: u.id } })
  }

  {
    const u = await prisma.user.create({ data: { email: `at-sub-mem-${TS}@test.com` } })
    const r = await api('POST', `/programs/${programId}/subscribe`, undefined, { userId: u.id })
    check('POST /programs/:id/subscribe (no role) → 201', 201, r.status)
    check('POST /programs/:id/subscribe → role=MEMBER', 'MEMBER', r.body.role)
    await prisma.user.delete({ where: { id: u.id } })
  }

  {
    // memberUser is already subscribed as MEMBER — re-subscribe promotes to PROGRAMMER
    const r = await api('POST', `/programs/${programId}/subscribe`, undefined, {
      userId: memberUserId,
      role: 'PROGRAMMER',
    })
    check('Re-subscribe MEMBER as PROGRAMMER → 201', 201, r.status)
    check('Re-subscribe → role promoted to PROGRAMMER', 'PROGRAMMER', r.body.role)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  if (workoutId) await prisma.workout.deleteMany({ where: { id: workoutId } })
  // Workouts with SetNull on program will stay; clean them up by programId
  await prisma.workout.deleteMany({ where: { programId } })
  await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: [memberUserId, programmerUserId] } } })
  await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
  console.log('  cleaned up')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await setup()
    await runTests()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
