/**
 * Integration tests for movement endpoints.
 *
 * Covers auth gates (401 / 403) on admin-gated routes (/movements/pending,
 * /movements/:id/review, /movements/:id PATCH) and full happy-path coverage
 * for member-accessible routes (/movements, /movements/suggest, gym workouts
 * movementIds filter).
 *
 * Admin happy-path tests (200 responses on /movements/pending,
 * /movements/:id/review, /movements/:id PATCH) require a real Keycloak token
 * with the 'admin' realm role — verify those flows manually against
 * qa.wodalytics.com.
 *
 * Run: cd apps/api && npx tsx tests/movements.ts
 */

import { prisma, ProgramRole } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
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
let memberUserId = ''
let programmerUserId = ''
let memberToken = ''
let programmerToken = ''
let thrusterMovementId = ''
let pullUpMovementId = ''
let workoutWithMovementId = ''
let workoutWithoutMovementId = ''
let pendingMovementId = ''
let pendingEditMovementId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `MV Gym ${TS}`, slug: `mv-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const memberUser = await prisma.user.create({ data: { email: `mv-member-${TS}@test.com` } })
  memberUserId = memberUser.id

  const programmerUser = await prisma.user.create({ data: { email: `mv-programmer-${TS}@test.com` } })
  programmerUserId = programmerUser.id

  await prisma.userGym.create({ data: { userId: programmerUserId, gymId, role: 'PROGRAMMER' } })
  await prisma.userGym.create({ data: { userId: memberUserId, gymId, role: 'MEMBER' } })

  const program = await prisma.program.create({
    data: {
      name: `MV Program ${TS}`,
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
  programmerToken = signTokenPair(programmerUserId, 'OWNER').accessToken

  // Seed two active movements for testing
  const thruster = await prisma.movement.upsert({
    where: { name: `Thruster-${TS}` },
    update: {},
    create: {
      name: `Thruster-${TS}`,
      status: 'ACTIVE',
      sourceUrl: 'https://www.crossfit.com/essentials/the-thruster',
      aliases: [`Thrust-${TS}`],
    },
  })
  thrusterMovementId = thruster.id

  const pullUp = await prisma.movement.upsert({
    where: { name: `Pull-up-${TS}` },
    update: {},
    create: { name: `Pull-up-${TS}`, status: 'ACTIVE' },
  })
  pullUpMovementId = pullUp.id

  // Seed a variation of pull-up so expansion tests work
  await prisma.movement.upsert({
    where: { name: `Kipping Pull-up-${TS}` },
    update: {},
    create: { name: `Kipping Pull-up-${TS}`, status: 'ACTIVE', parentId: pullUpMovementId },
  })

  // Workout with the thruster + pull-up movements
  const w1 = await prisma.workout.create({
    data: {
      programId,
      title: 'Fran-like',
      description: `21-15-9 Thruster-${TS} Pull-up-${TS}`,
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-03-15T10:00:00Z'),
      workoutMovements: { create: [{ movementId: thrusterMovementId }, { movementId: pullUpMovementId }] },
    },
  })
  workoutWithMovementId = w1.id

  // Workout without movements
  const w2 = await prisma.workout.create({
    data: {
      programId,
      title: 'Pure Cardio',
      description: 'Row 5k',
      type: 'CARDIO',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-03-16T10:00:00Z'),
    },
  })
  workoutWithoutMovementId = w2.id

  // Pre-existing pending movement (used for review auth gate tests)
  const pending = await prisma.movement.create({
    data: { name: `Pending-Move-${TS}`, status: 'PENDING' },
  })
  pendingMovementId = pending.id

  // Separate pending movement for edit auth gate tests
  const pendingEdit = await prisma.movement.create({
    data: { name: `Pending-Edit-${TS}`, status: 'PENDING' },
  })
  pendingEditMovementId = pendingEdit.id

  console.log(`  gym=${gymId}  program=${programId}`)
  console.log(`  programmer=${programmerUserId}  member=${memberUserId}`)
  console.log(`  thruster=${thrusterMovementId}  pullUp=${pullUpMovementId}`)
  console.log(`  workoutWithMovement=${workoutWithMovementId}  workoutWithout=${workoutWithoutMovementId}`)
  console.log(`  pendingMovement=${pendingMovementId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── GET /api/movements ───────────────────────────────────────────────────────
  console.log('\n=== GET /api/movements ===')

  {
    const r = await api('GET', '/movements', memberToken)
    check('T1: GET /api/movements → 200', 200, r.status)
    check('T1: returns array', true, Array.isArray(r.body))
    const arr = r.body as unknown as { id: string; sourceUrl: string | null; aliases: string[] }[]
    check('T1: includes seeded thruster', true, arr.some((m) => m.id === thrusterMovementId))
    const thr = arr.find((m) => m.id === thrusterMovementId)!
    check('T1: thruster exposes sourceUrl', 'https://www.crossfit.com/essentials/the-thruster', thr.sourceUrl)
    check('T1: thruster exposes aliases', `Thrust-${TS}`, (thr.aliases ?? [])[0])
    const pu = arr.find((m) => m.id === pullUpMovementId)!
    check('T1: pull-up sourceUrl null when unset', null, pu.sourceUrl)
    check('T1: pull-up aliases empty when unset', 0, (pu.aliases ?? []).length)
  }

  {
    const r = await api('GET', '/movements')
    check('T2: GET /api/movements no auth → 401', 401, r.status)
  }

  // ── POST /api/movements/suggest ──────────────────────────────────────────────
  console.log('\n=== POST /api/movements/suggest ===')

  let suggestedMovementId = ''
  {
    const r = await api('POST', '/movements/suggest', memberToken, { name: `Suggested-${TS}` })
    check('T3: POST /api/movements/suggest → 201', 201, r.status)
    check('T3: status PENDING', 'PENDING', r.body.status)
    suggestedMovementId = r.body.id as string
  }

  {
    const r = await api('POST', '/movements/suggest', memberToken, { name: `Suggested-${TS}` })
    check('T4: POST /api/movements/suggest duplicate → 409', 409, r.status)
  }

  {
    const r = await api('POST', '/movements/suggest', undefined, { name: `No-Auth-${TS}` })
    check('T5: POST /api/movements/suggest no auth → 401', 401, r.status)
  }

  // ── GET /api/movements/pending ───────────────────────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  // Verify manually against qa.wodalytics.com.
  console.log('\n=== GET /api/movements/pending — auth gates ===')

  {
    const r = await api('GET', '/movements/pending')
    check('T6: GET /api/movements/pending no auth → 401', 401, r.status)
  }

  {
    const r = await api('GET', '/movements/pending', memberToken)
    check('T7: GET /api/movements/pending non-admin (legacy token) → 403', 403, r.status)
  }

  // ── PATCH /api/movements/:id/review ─────────────────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  console.log('\n=== PATCH /api/movements/:id/review — auth gates ===')

  {
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, undefined, { status: 'ACTIVE' })
    check('T8: PATCH review no auth → 401', 401, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, memberToken, { status: 'ACTIVE' })
    check('T9: PATCH review non-admin (legacy token) → 403', 403, r.status)
  }

  // ── POST /api/movements/detect ───────────────────────────────────────────────
  // Endpoint removed in #330 — clients now run the matcher against the
  // catalog they cache via useMovements(). Coverage moved to the shared
  // util's unit tests (packages/types/src/movementMatcher.test.ts).
  console.log('\n=== POST /api/movements/detect (removed in #330) ===')
  {
    const r = await api('POST', '/movements/detect', memberToken, { description: 'anything' })
    check('T11: POST /api/movements/detect → 404 (route removed)', 404, r.status)
  }

  // ── GET /api/gyms/:gymId/workouts?movementIds= ───────────────────────────────
  console.log('\n=== GET /api/gyms/:gymId/workouts?movementIds= ===')

  {
    const r = await api(
      'GET',
      `/gyms/${gymId}/workouts?from=2026-03-01&to=2026-03-31&movementIds=${thrusterMovementId}`,
      programmerToken,
    )
    check('T13: movementIds filter → 200', 200, r.status)
    const arr = r.body as unknown as { id: string }[]
    check('T13: includes workout with movement', true, arr.some((w) => w.id === workoutWithMovementId))
    check('T13: excludes workout without movement', false, arr.some((w) => w.id === workoutWithoutMovementId))
  }

  {
    // Filter by base (pullUpMovementId) — expansion should include kipping pull-up variation
    // The workout directly has pullUpMovementId, so this verifies base movement matching
    const r = await api(
      'GET',
      `/gyms/${gymId}/workouts?from=2026-03-01&to=2026-03-31&movementIds=${pullUpMovementId}`,
      programmerToken,
    )
    check('T14: movementIds base expands to variations → 200', 200, r.status)
    const arr = r.body as unknown as { id: string }[]
    check('T14: includes workout with base movement', true, arr.some((w) => w.id === workoutWithMovementId))
  }

  {
    const r = await api(
      'GET',
      `/gyms/${gymId}/workouts?from=2026-03-01&to=2026-03-31&movementIds=${thrusterMovementId}`,
    )
    check('T15: movementIds filter no auth → 401', 401, r.status)
  }

  // ── PATCH /api/movements/:id (update pending) ────────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  console.log('\n=== PATCH /api/movements/:id — auth gates ===')

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, undefined, { name: `NoAuth-${TS}` })
    check('T21: edit pending no auth → 401', 401, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, memberToken, { name: `NonAdmin-${TS}` })
    check('T20: edit pending non-admin (legacy token) → 403', 403, r.status)
  }

  // Suppress unused-variable warning from suggestedMovementId — it's seeded via T3 and cleaned by teardown
  void suggestedMovementId
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({ where: { programId } })
  await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  // Delete movements created in this test run (variations first due to parentId FK)
  await prisma.movement.deleteMany({ where: { name: { endsWith: `-${TS}` }, parentId: { not: null } } })
  await prisma.movement.deleteMany({ where: { name: { endsWith: `-${TS}` } } })
  await prisma.userGym.deleteMany({ where: { gymId } }).catch(() => {})
  await prisma.user.delete({ where: { id: memberUserId } }).catch(() => {})
  await prisma.user.delete({ where: { id: programmerUserId } }).catch(() => {})
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
