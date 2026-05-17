/**
 * Integration tests for movements analytics endpoints (issue #366):
 *   GET /api/me/analytics/movements
 *   GET /api/me/analytics/movements/:movementId
 *   GET /api/me/analytics/movements/:movementId/trajectory
 *
 * Covers:
 *   - 401 for unauthenticated requests on all three endpoints
 *   - Single-type movement (Squat, LOAD prType)
 *   - Multi-type movement (Rower, DISTANCE+CALORIES+TIME prTypes)
 *   - MAX_REPS movement (Pull-Up)
 *   - Empty state: movements with no logged sets excluded from /movements list
 *   - /movements/:id returns byType entries for every prType in the list
 *   - /movements/:id/trajectory returns chronological points for requested prType
 *   - /movements/:id/trajectory 400 when prType not in movement's prTypes list
 *   - /movements/:id 404 for unknown movementId
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
  return { status: res.status, body: json }
}

const TS = Date.now()
let userId = ''
let token = ''
let programId = ''

// Movement IDs
let squatId = ''     // STRENGTH, prTypes: [LOAD]
let rowerId = ''     // MONOSTRUCTURAL, prTypes: [DISTANCE, CALORIES, TIME]
let pullUpId = ''    // GYMNASTICS, prTypes: [MAX_REPS, LOAD]

const workoutIdsToDelete: string[] = []
const resultIdsToDelete: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const user = await prisma.user.create({ data: { email: `analytics-mov-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'MEMBER').accessToken

  const program = await prisma.program.create({
    data: { name: `Prog-mov-${TS}`, startDate: new Date(), ownerUserId: userId },
  })
  programId = program.id

  // Single-type: STRENGTH, LOAD
  const squat = await prisma.movement.create({
    data: { name: `Squat-${TS}`, category: 'STRENGTH', prTypes: ['LOAD'] },
  })
  squatId = squat.id

  // Multi-type: MONOSTRUCTURAL, DISTANCE+CALORIES+TIME
  const rower = await prisma.movement.create({
    data: { name: `Rower-${TS}`, category: 'MONOSTRUCTURAL', prTypes: ['DISTANCE', 'CALORIES', 'TIME'] },
  })
  rowerId = rower.id

  // Multi-type: GYMNASTICS, MAX_REPS+LOAD
  const pullUp = await prisma.movement.create({
    data: { name: `PullUp-${TS}`, category: 'GYMNASTICS', prTypes: ['MAX_REPS', 'LOAD'] },
  })
  pullUpId = pullUp.id

  console.log('  done')
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { id: { in: resultIdsToDelete } } })
  await prisma.workout.deleteMany({ where: { id: { in: workoutIdsToDelete } } })
  await prisma.movement.deleteMany({ where: { id: { in: [squatId, rowerId, pullUpId] } } })
  await prisma.program.deleteMany({ where: { id: programId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  console.log('  done')
}

async function seedWorkout(movId: string, offsetDays: number) {
  const scheduledAt = new Date()
  scheduledAt.setUTCDate(scheduledAt.getUTCDate() - offsetDays)
  scheduledAt.setUTCHours(12, 0, 0, 0)
  const wod = await prisma.workout.create({
    data: {
      title: `WOD-mov-${TS}-${movId.slice(-4)}-d${offsetDays}`,
      description: '',
      type: 'STRENGTH',
      scheduledAt,
      status: 'PUBLISHED',
      programId,
    },
  })
  await prisma.workoutMovement.create({ data: { workoutId: wod.id, movementId: movId, displayOrder: 0 } })
  workoutIdsToDelete.push(wod.id)
  return wod
}

async function seedResult(workoutId: string, movId: string, value: unknown) {
  const wod = await prisma.workout.findUnique({ where: { id: workoutId }, select: { scheduledAt: true } })
  const r = await prisma.result.create({
    data: {
      userId,
      workoutId,
      level: 'RX',
      workoutGender: 'OPEN',
      value: value as never,
      createdAt: wod!.scheduledAt,
    },
  })
  resultIdsToDelete.push(r.id)
  return r
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

async function testAuth401() {
  console.log('\n=== 401 for all three endpoints when unauthenticated ===')
  const r1 = await api('GET', '/me/analytics/movements')
  check('GET /movements status 401', 401, r1.status)

  const r2 = await api('GET', '/me/analytics/movements/some-id')
  check('GET /movements/:id status 401', 401, r2.status)

  const r3 = await api('GET', '/me/analytics/movements/some-id/trajectory?prType=LOAD')
  check('GET /movements/:id/trajectory status 401', 401, r3.status)
}

// ─── GET /movements empty state ───────────────────────────────────────────────

async function testMovementsEmptyState() {
  console.log('\n=== GET /movements empty state (no logged results) ===')
  const res = await api('GET', '/me/analytics/movements', token)
  check('status 200', 200, res.status)
  const body = res.body as Record<string, unknown[]>
  check('strength is empty array', 0, body.strength?.length ?? -1)
  check('monostructural is empty array', 0, body.monostructural?.length ?? -1)
  check('gymnastics is empty array', 0, body.gymnastics?.length ?? -1)
}

// ─── GET /movements with seeded data ─────────────────────────────────────────

async function testMovementsWithData() {
  console.log('\n=== GET /movements — single-type (Squat/LOAD), multi-type (Rower/DISTANCE+CALORIES+TIME) ===')

  // Squat: two sessions, best 1RM = 315
  const w1 = await seedWorkout(squatId, 10)
  await seedResult(w1.id, squatId, {
    movementResults: [{ workoutMovementId: squatId, loadUnit: 'LB', sets: [{ reps: '1', load: 225 }] }],
  })
  const w2 = await seedWorkout(squatId, 5)
  await seedResult(w2.id, squatId, {
    movementResults: [{ workoutMovementId: squatId, loadUnit: 'LB', sets: [{ reps: '1', load: 315 }] }],
  })

  // Rower: one session, best distance = 2000M in 390s, 45 cal in 600s
  const w3 = await seedWorkout(rowerId, 3)
  await seedResult(w3.id, rowerId, {
    movementResults: [{
      workoutMovementId: rowerId,
      distanceUnit: 'M',
      sets: [
        { distance: 2000, seconds: 390 },
        { calories: 45, seconds: 600 },
      ],
    }],
  })

  // Pull-Up: one session
  const w4 = await seedWorkout(pullUpId, 7)
  await seedResult(w4.id, pullUpId, {
    movementResults: [{ workoutMovementId: pullUpId, loadUnit: 'LB', sets: [{ reps: '20' }, { reps: '1', load: 45 }] }],
  })

  const res = await api('GET', '/me/analytics/movements', token)
  check('status 200', 200, res.status)
  const body = res.body as {
    strength: { movementId: string; name: string; prTypes: string[]; primaryPR: Record<string, unknown> | null; lastLoggedAt: string }[]
    monostructural: { movementId: string; prTypes: string[]; primaryPR: Record<string, unknown> | null }[]
    gymnastics: { movementId: string; prTypes: string[] }[]
  }

  // Strength group
  const squat = body.strength?.find((m) => m.movementId === squatId)
  check('squat in strength group', true, squat !== undefined)
  check('squat prTypes includes LOAD', true, squat?.prTypes?.includes('LOAD'))
  check('squat primaryPR type is LOAD', 'LOAD', squat?.primaryPR?.type)
  check('squat primaryPR load is 315', 315, squat?.primaryPR?.load)

  // Monostructural group
  const rower = body.monostructural?.find((m) => m.movementId === rowerId)
  check('rower in monostructural group', true, rower !== undefined)
  check('rower prTypes has 3 types', 3, rower?.prTypes?.length)
  check('rower primaryPR type is DISTANCE', 'DISTANCE', rower?.primaryPR?.type)

  // Gymnastics group
  const pullUp = body.gymnastics?.find((m) => m.movementId === pullUpId)
  check('pullUp in gymnastics group', true, pullUp !== undefined)
  check('pullUp prTypes has MAX_REPS first', 'MAX_REPS', pullUp?.prTypes?.[0])
}

// ─── GET /movements/:id — single-type ────────────────────────────────────────

async function testMovementPrsSquat() {
  console.log('\n=== GET /movements/:id — Squat (LOAD, single type) ===')
  const res = await api('GET', `/me/analytics/movements/${squatId}`, token)
  check('status 200', 200, res.status)
  const body = res.body as {
    movement: { prTypes: string[] }
    byType: Record<string, { entries: unknown[] }>
    recentAppearances: { workoutId: string; scheduledAt: string; yourSets: unknown[] }[]
  }
  check('byType has LOAD key', true, 'LOAD' in body.byType)
  check('LOAD entries is array', true, Array.isArray(body.byType.LOAD?.entries))
  check('LOAD entries length >= 1', true, (body.byType.LOAD?.entries?.length ?? 0) >= 1)
  check('recentAppearances is array', true, Array.isArray(body.recentAppearances))
  check('recentAppearances length >= 1', true, body.recentAppearances.length >= 1)
  check('recentAppearances entry has workoutId', true, typeof body.recentAppearances[0]?.workoutId === 'string')
  check('recentAppearances entry has yourSets', true, Array.isArray(body.recentAppearances[0]?.yourSets))
}

// ─── GET /movements/:id — multi-type ─────────────────────────────────────────

async function testMovementPrsRower() {
  console.log('\n=== GET /movements/:id — Rower (DISTANCE+CALORIES+TIME, multi-type) ===')
  const res = await api('GET', `/me/analytics/movements/${rowerId}`, token)
  check('status 200', 200, res.status)
  const body = res.body as {
    movement: { prTypes: string[] }
    byType: Record<string, { entries: unknown[] }>
    recentAppearances: unknown[]
  }
  check('byType has DISTANCE', true, 'DISTANCE' in body.byType)
  check('byType has CALORIES', true, 'CALORIES' in body.byType)
  check('byType has TIME', true, 'TIME' in body.byType)
  check('DISTANCE entries >= 1', true, (body.byType.DISTANCE?.entries?.length ?? 0) >= 1)
  check('CALORIES entries >= 1', true, (body.byType.CALORIES?.entries?.length ?? 0) >= 1)
  // TIME: no sets with both distance+seconds in the "time" direction (our sets have either dist+sec or cal+sec)
  // The rower data has distance+seconds which matches TIME (best time per distance) — should have 1 entry
  check('TIME entries >= 1', true, (body.byType.TIME?.entries?.length ?? 0) >= 1)
}

// ─── GET /movements/:id — not found ──────────────────────────────────────────

async function testMovementPrsNotFound() {
  console.log('\n=== GET /movements/:id — 404 for unknown id ===')
  const res = await api('GET', '/me/analytics/movements/nonexistent-movement-id', token)
  check('status 404', 404, res.status)
}

// ─── GET /movements/:id/trajectory ───────────────────────────────────────────

async function testTrajectoryLoad() {
  console.log('\n=== GET /movements/:id/trajectory — Squat LOAD trajectory ===')
  const res = await api('GET', `/me/analytics/movements/${squatId}/trajectory?prType=LOAD&range=3M`, token)
  check('status 200', 200, res.status)
  const body = res.body as { prType: string; points: { achievedAt: string; value: number; label: string }[] }
  check('prType is LOAD', 'LOAD', body.prType)
  check('points is array', true, Array.isArray(body.points))
  check('points length >= 1', true, body.points.length >= 1)
  check('point has achievedAt', true, typeof body.points[0]?.achievedAt === 'string')
  check('point has value', true, typeof body.points[0]?.value === 'number')
  check('point has label', true, typeof body.points[0]?.label === 'string')
  check('points are chronological', true, (() => {
    const dates = body.points.map((p) => p.achievedAt)
    return JSON.stringify(dates) === JSON.stringify([...dates].sort())
  })())
}

async function testTrajectoryMaxReps() {
  console.log('\n=== GET /movements/:id/trajectory — PullUp MAX_REPS trajectory ===')
  const res = await api('GET', `/me/analytics/movements/${pullUpId}/trajectory?prType=MAX_REPS&range=3M`, token)
  check('status 200', 200, res.status)
  const body = res.body as { prType: string; points: { value: number }[] }
  check('prType is MAX_REPS', 'MAX_REPS', body.prType)
  check('has points', true, body.points.length >= 1)
  check('max reps point value >= 20', true, (body.points[body.points.length - 1]?.value ?? 0) >= 20)
}

async function testTrajectoryInvalidPrType() {
  console.log('\n=== GET /movements/:id/trajectory — 400 for prType not in movement list ===')
  // Squat only has LOAD — requesting TIME should 400
  const res = await api('GET', `/me/analytics/movements/${squatId}/trajectory?prType=TIME&range=3M`, token)
  check('status 400', 400, res.status)
}

async function testTrajectoryMissingPrType() {
  console.log('\n=== GET /movements/:id/trajectory — 400 when prType missing ===')
  const res = await api('GET', `/me/analytics/movements/${squatId}/trajectory?range=3M`, token)
  check('status 400', 400, res.status)
}

// ─── Run ──────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    await setup()
    await testAuth401()
    await testMovementsEmptyState()
    await testMovementsWithData()
    await testMovementPrsSquat()
    await testMovementPrsRower()
    await testMovementPrsNotFound()
    await testTrajectoryLoad()
    await testTrajectoryMaxReps()
    await testTrajectoryInvalidPrType()
    await testTrajectoryMissingPrType()
  } finally {
    await teardown()
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
    if (fail > 0) process.exit(1)
  }
})()
