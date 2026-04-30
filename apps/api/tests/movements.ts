/**
 * Integration tests for movement endpoints.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Requires: WODALYTICS_ADMIN_EMAILS set in .env (the API server reads it at
 * request time). Pending movement review is gated by the same admin
 * allowlist as the rest of the WODalytics admin surface.
 * Run: cd apps/api && npx tsx tests/movements.ts
 */

import { prisma, ProgramRole } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'
import { parseAdminEmails } from '../src/middleware/auth.js'

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
let reviewerUserId = ''
let reviewerUserCreated = false
let memberToken = ''
let reviewerToken = ''
let thrusterMovementId = ''
let pullUpMovementId = ''
let workoutWithMovementId = ''
let workoutWithoutMovementId = ''
let pendingMovementId = ''
let pendingEditMovementId = ''

async function setup() {
  console.log('\n=== Setup ===')

  // The API server reads WODALYTICS_ADMIN_EMAILS from its own env at request
  // time. The test must use one of those emails so the API's check passes.
  const allowed = [...parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)]
  if (allowed.length === 0) {
    throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env to run movements tests')
  }
  const reviewerEmail = allowed[0]

  // Use existing reviewer account if present (e.g. ccmagrane@gmail.com in prod env);
  // otherwise create a temporary test user and clean it up in teardown.
  const existingReviewer = await prisma.user.findUnique({ where: { email: reviewerEmail } })
  if (existingReviewer) {
    reviewerUserId = existingReviewer.id
  } else {
    const created = await prisma.user.create({ data: { email: reviewerEmail } })
    reviewerUserId = created.id
    reviewerUserCreated = true
  }

  const gym = await prisma.gym.create({
    data: { name: `MV Gym ${TS}`, slug: `mv-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const memberUser = await prisma.user.create({ data: { email: `mv-member-${TS}@test.com` } })
  memberUserId = memberUser.id

  await prisma.userGym.create({ data: { userId: reviewerUserId, gymId, role: 'PROGRAMMER' } })
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
            { userId: reviewerUserId, role: ProgramRole.PROGRAMMER },
          ],
        },
      },
    },
  })
  programId = program.id

  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken
  reviewerToken = signTokenPair(reviewerUserId, 'OWNER').accessToken

  // Seed two active movements for testing
  const thruster = await prisma.movement.upsert({
    where: { name: `Thruster-${TS}` },
    update: {},
    create: { name: `Thruster-${TS}`, status: 'ACTIVE' },
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

  // Pre-existing pending movement (used for review tests)
  const pending = await prisma.movement.create({
    data: { name: `Pending-Move-${TS}`, status: 'PENDING' },
  })
  pendingMovementId = pending.id

  // Separate pending movement for edit tests (review tests don't touch this one)
  const pendingEdit = await prisma.movement.create({
    data: { name: `Pending-Edit-${TS}`, status: 'PENDING' },
  })
  pendingEditMovementId = pendingEdit.id

  console.log(`  gym=${gymId}  program=${programId}`)
  console.log(`  reviewer=${reviewerUserId} (${reviewerEmail})`)
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
    const arr = r.body as unknown as { id: string }[]
    check('T1: includes seeded thruster', true, arr.some((m) => m.id === thrusterMovementId))
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
  console.log('\n=== GET /api/movements/pending ===')

  {
    const r = await api('GET', '/movements/pending', reviewerToken)
    check('T6: GET /api/movements/pending → 200', 200, r.status)
    const arr = r.body as unknown as { id: string }[]
    check('T6: includes pre-seeded pending', true, arr.some((m) => m.id === pendingMovementId))
    check('T6: includes suggested movement', true, arr.some((m) => m.id === suggestedMovementId))
  }

  {
    const r = await api('GET', '/movements/pending', memberToken)
    check('T7: GET /api/movements/pending non-reviewer → 403', 403, r.status)
  }

  // ── PATCH /api/movements/:id/review ─────────────────────────────────────────
  console.log('\n=== PATCH /api/movements/:id/review ===')

  {
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, reviewerToken, { status: 'ACTIVE' })
    check('T8: PATCH review accept → 200', 200, r.status)
    check('T8: status ACTIVE', 'ACTIVE', r.body.status)
  }

  {
    const r = await api('PATCH', `/movements/${suggestedMovementId}/review`, reviewerToken, { status: 'REJECTED' })
    check('T9: PATCH review reject → 200', 200, r.status)
    check('T9: status REJECTED', 'REJECTED', r.body.status)
  }

  {
    // pendingMovementId is now ACTIVE — reviewing it again should 400
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, reviewerToken, { status: 'REJECTED' })
    check('T10: PATCH review non-PENDING movement → 400', 400, r.status)
  }

  // ── POST /api/movements/detect ───────────────────────────────────────────────
  console.log('\n=== POST /api/movements/detect ===')

  {
    const r = await api('POST', '/movements/detect', memberToken, {
      description: `21-15-9 Thruster-${TS} Pull-up-${TS}`,
    })
    check('T11: POST /api/movements/detect → 200', 200, r.status)
    const arr = r.body as unknown as { id: string }[]
    check('T11: detects thruster', true, arr.some((m) => m.id === thrusterMovementId))
    check('T11: detects pull-up', true, arr.some((m) => m.id === pullUpMovementId))
  }

  {
    const r = await api('POST', '/movements/detect', undefined, { description: 'test' })
    check('T12: POST /api/movements/detect no auth → 401', 401, r.status)
  }

  // ── GET /api/gyms/:gymId/workouts?movementIds= ───────────────────────────────
  console.log('\n=== GET /api/gyms/:gymId/workouts?movementIds= ===')

  {
    const r = await api(
      'GET',
      `/gyms/${gymId}/workouts?from=2026-03-01&to=2026-03-31&movementIds=${thrusterMovementId}`,
      reviewerToken,
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
      reviewerToken,
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
  console.log('\n=== PATCH /api/movements/:id ===')

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, reviewerToken, { name: `Renamed-Edit-${TS}` })
    check('T16: rename PENDING movement → 200', 200, r.status)
    check('T16: name updated', `Renamed-Edit-${TS}`, r.body.name)
    check('T16: still PENDING', 'PENDING', r.body.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, reviewerToken, { parentId: thrusterMovementId })
    check('T17: set parentId on PENDING movement → 200', 200, r.status)
    check('T17: parentId set', thrusterMovementId, (r.body.parent as { id: string } | null)?.id)
  }

  {
    // pendingMovementId was approved (ACTIVE) in T8 — editing it must fail
    const r = await api('PATCH', `/movements/${pendingMovementId}`, reviewerToken, { name: `Should-Fail-${TS}` })
    check('T18: edit ACTIVE movement → 400', 400, r.status)
  }

  {
    // Try to rename to an already-existing movement name (thrusterMovementId's name)
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, reviewerToken, { name: `Thruster-${TS}` })
    check('T19: rename to duplicate name → 409', 409, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, memberToken, { name: `NonReviewer-${TS}` })
    check('T20: edit pending as non-reviewer → 403', 403, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingEditMovementId}`, undefined, { name: `NoAuth-${TS}` })
    check('T21: edit pending no auth → 401', 401, r.status)
  }
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
  if (reviewerUserCreated) await prisma.user.delete({ where: { id: reviewerUserId } }).catch(() => {})
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
