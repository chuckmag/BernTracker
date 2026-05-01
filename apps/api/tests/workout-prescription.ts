/**
 * Integration tests for the per-WorkoutMovement prescription shape introduced
 * by issue #3 slice 1. Covers create + update with the new `movements` array,
 * workout-level `timeCapSeconds` / `tracksRounds`, and reps/tempo regex
 * validation.
 *
 * Requires: API on localhost:3000 (or $API_URL), DB via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/workout-prescription.ts
 */

import { prisma, ProgramRole } from '@wodalytics/db'
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
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> & unknown[] }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let gymId = ''
let programId = ''
let programmerToken = ''
let backSquatId = ''
let rdlId = ''
let createdWorkoutId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `AT WP Gym ${TS}`, slug: `at-wp-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const programmer = await prisma.user.create({ data: { email: `at-wp-programmer-${TS}@test.com` } })
  await prisma.userGym.create({ data: { userId: programmer.id, gymId, role: 'PROGRAMMER' } })
  programmerToken = signTokenPair(programmer.id, 'PROGRAMMER').accessToken

  const program = await prisma.program.create({
    data: {
      name: `AT WP Program ${TS}`,
      startDate: new Date('2026-03-01'),
      gyms: { create: { gymId } },
      members: { create: { userId: programmer.id, role: ProgramRole.PROGRAMMER } },
    },
  })
  programId = program.id

  // Movement library — upsert so we don't fight other tests over names.
  const backSquat = await prisma.movement.upsert({
    where: { name: 'Back Squat' },
    create: { name: 'Back Squat', status: 'ACTIVE' },
    update: {},
  })
  const rdl = await prisma.movement.upsert({
    where: { name: 'RDL' },
    create: { name: 'RDL', status: 'ACTIVE' },
    update: {},
  })
  backSquatId = backSquat.id
  rdlId = rdl.id

  console.log(`  gym=${gymId} program=${programId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== POST /gyms/:gymId/workouts with movements prescription ===')

  {
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP Strength ${TS}`,
      description: 'Back Squat 5x5 + RDL 5x10',
      type: 'POWER_LIFTING',
      scheduledAt: '2026-03-15T10:00:00Z',
      movements: [
        { movementId: backSquatId, sets: 5, reps: '5',  load: 225, loadUnit: 'LB', tempo: '3.1.1.0' },
        { movementId: rdlId,       sets: 5, reps: '10', load: 135, loadUnit: 'LB' },
      ],
    })
    check('POST strength workout → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    createdWorkoutId = body.id as string
    const wms = body.workoutMovements as Array<Record<string, unknown>>
    check('returns 2 workoutMovements', 2, wms.length)
    const bs = wms.find((w) => w.movementId === backSquatId)!
    check('BackSquat sets=5', 5, bs.sets)
    check('BackSquat reps="5"', '5', bs.reps)
    check('BackSquat load=225', 225, bs.load)
    check('BackSquat loadUnit=LB', 'LB', bs.loadUnit)
    check('BackSquat tempo=3.1.1.0', '3.1.1.0', bs.tempo)
    check('BackSquat displayOrder defaults to array index 0', 0, bs.displayOrder)
    check('BackSquat tracksLoad defaults to true', true, bs.tracksLoad)
    const rdl = wms.find((w) => w.movementId === rdlId)!
    check('RDL displayOrder defaults to array index 1', 1, rdl.displayOrder)
    check('RDL tracksLoad defaults to true', true, rdl.tracksLoad)
  }

  console.log('\n=== tracksLoad flag round-trips ===')

  {
    // Create a workout where one movement explicitly opts out of load
    // (e.g. a plyometric superset).
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP TracksLoad ${TS}`,
      description: 'Squat + Box Jump superset',
      type: 'POWER_LIFTING',
      scheduledAt: '2026-03-18T10:00:00Z',
      movements: [
        { movementId: backSquatId, sets: 5, reps: '5', tracksLoad: true },
        { movementId: rdlId,       sets: 5, reps: '10', tracksLoad: false },
      ],
    })
    check('POST with explicit tracksLoad → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    const wms = body.workoutMovements as Array<Record<string, unknown>>
    const bs = wms.find((w) => w.movementId === backSquatId)!
    const rdl = wms.find((w) => w.movementId === rdlId)!
    check('BackSquat tracksLoad=true persisted', true, bs.tracksLoad)
    check('RDL tracksLoad=false persisted', false, rdl.tracksLoad)

    // Round-trip via PATCH — flip Back Squat off, RDL on.
    const wodId = body.id as string
    const r2 = await api('PATCH', `/workouts/${wodId}`, programmerToken, {
      movements: [
        { movementId: backSquatId, sets: 5, reps: '5', tracksLoad: false },
        { movementId: rdlId,       sets: 5, reps: '10', tracksLoad: true },
      ],
    })
    const body2 = r2.body as Record<string, unknown>
    const wms2 = body2.workoutMovements as Array<Record<string, unknown>>
    const bs2 = wms2.find((w) => w.movementId === backSquatId)!
    const rdl2 = wms2.find((w) => w.movementId === rdlId)!
    check('PATCH BackSquat tracksLoad=false persisted', false, bs2.tracksLoad)
    check('PATCH RDL tracksLoad=true persisted', true, rdl2.tracksLoad)
  }

  {
    // AMRAP with workout-level fields
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP AMRAP ${TS}`,
      description: '15 min AMRAP',
      type: 'AMRAP',
      scheduledAt: '2026-03-16T10:00:00Z',
      timeCapSeconds: 900,
      tracksRounds: true,
    })
    check('POST AMRAP with timeCap+tracksRounds → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    check('timeCapSeconds=900', 900, body.timeCapSeconds)
    check('tracksRounds=true', true, body.tracksRounds)
  }

  console.log('\n=== Validation: bad reps / tempo ===')

  {
    // reps must match /^\d+(\.\d+)*$/ — "abc" fails
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP Bad Reps ${TS}`,
      description: 'broken',
      type: 'POWER_LIFTING',
      scheduledAt: '2026-03-17T10:00:00Z',
      movements: [{ movementId: backSquatId, reps: 'abc' }],
    })
    check('POST with bad reps → 400', 400, r.status)
  }

  {
    // tempo must match /^[\dxX](\.[\dxX]){3}$/ — three digits only fails
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP Bad Tempo ${TS}`,
      description: 'broken',
      type: 'POWER_LIFTING',
      scheduledAt: '2026-03-17T11:00:00Z',
      movements: [{ movementId: backSquatId, tempo: '3.1.1' }],
    })
    check('POST with bad tempo → 400', 400, r.status)
  }

  {
    // tempo "x.0.x.0" with 'x' tokens passes
    const r = await api('POST', `/gyms/${gymId}/workouts`, programmerToken, {
      programId,
      title: `AT WP X-Tempo ${TS}`,
      description: 'x-tempo',
      type: 'POWER_LIFTING',
      scheduledAt: '2026-03-17T12:00:00Z',
      movements: [{ movementId: backSquatId, tempo: 'x.0.x.0' }],
    })
    check('POST with tempo "x.0.x.0" → 201', 201, r.status)
  }

  console.log('\n=== PATCH /workouts/:id replaces movements ===')

  {
    const r = await api('PATCH', `/workouts/${createdWorkoutId}`, programmerToken, {
      movements: [
        { movementId: backSquatId, sets: 3, reps: '3', load: 275, loadUnit: 'LB' },
      ],
    })
    check('PATCH with new movements → 200', 200, r.status)
    const body = r.body as Record<string, unknown>
    const wms = body.workoutMovements as Array<Record<string, unknown>>
    check('PATCH replaces to single movement', 1, wms.length)
    check('PATCH new sets=3', 3, wms[0].sets)
    check('PATCH new load=275', 275, wms[0].load)
  }

  {
    // Both `movements` and `movementIds` in one body → 400 (refine).
    const r = await api('PATCH', `/workouts/${createdWorkoutId}`, programmerToken, {
      movementIds: [backSquatId],
      movements:   [{ movementId: backSquatId }],
    })
    check('PATCH with both movements+movementIds → 400', 400, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  // Cascade-delete via gym & program — workouts/movements cascade off them.
  await prisma.workout.deleteMany({ where: { programId } })
  await prisma.program.deleteMany({ where: { id: programId } })
  await prisma.userGym.deleteMany({ where: { gymId } })
  await prisma.gym.deleteMany({ where: { id: gymId } })
  await prisma.user.deleteMany({ where: { email: { contains: `at-wp-programmer-${TS}` } } })
  console.log('  cleaned up')
}

async function main() {
  try {
    await setup()
    await runTests()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n=== Workout prescription: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
