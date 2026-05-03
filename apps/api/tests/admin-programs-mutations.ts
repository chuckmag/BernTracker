/**
 * Integration tests for the WODalytics admin mutating endpoints (slice 3 of #160).
 *
 * Covers:
 *   - POST   /api/admin/programs                  — create
 *   - PATCH  /api/admin/programs/:id              — update
 *   - DELETE /api/admin/programs/:id              — delete
 *   - POST   /api/admin/programs/:id/workouts     — create workout
 *   - PATCH  /api/admin/workouts/:id              — update workout
 *   - DELETE /api/admin/workouts/:id              — delete workout
 *
 * Auth gates (401 / 403) on every mutation. Affiliated-program guards: every
 * mutation that targets an existing program (PATCH/DELETE program, POST
 * workout) must 404 when the program is gym-affiliated, AND when the
 * program is a Personal Program (ownerUserId != null) — both routed
 * through the shared `findUnaffiliatedProgramById` predicate.
 *
 * Requires: API running, WODALYTICS_ADMIN_EMAILS in .env. Run:
 *   cd apps/api && npx tsx tests/admin-programs-mutations.ts
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'
import { parseAdminEmails } from '../src/middleware/auth.js'

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
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json as Record<string, unknown> | unknown[] }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let adminUserId = ''
let nonAdminUserId = ''
let personalUserId = ''
let adminToken = ''
let nonAdminToken = ''
let publicProgramId = ''
let affiliatedProgramId = ''
let personalProgramId = ''
let publicWorkoutId = ''
let affiliatedWorkoutId = ''
let affiliatedGymId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const allowed = [...parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)]
  if (allowed.length === 0) throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env')
  const adminEmail = allowed[0]

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail },
  })
  adminUserId = admin.id

  const nonAdmin = await prisma.user.create({ data: { email: `admin-mut-nonadmin-${TS}@test.com` } })
  nonAdminUserId = nonAdmin.id

  const personal = await prisma.user.create({ data: { email: `admin-mut-personal-${TS}@test.com` } })
  personalUserId = personal.id

  adminToken = signTokenPair(adminUserId, 'OWNER').accessToken
  nonAdminToken = signTokenPair(nonAdminUserId, 'MEMBER').accessToken

  // Public-catalog program (admin should mutate)
  const pub = await prisma.program.create({
    data: {
      name: `Admin-Mut-Public-${TS}`,
      visibility: 'PUBLIC',
      startDate: new Date('2026-04-01'),
    },
  })
  publicProgramId = pub.id

  const pubWorkout = await prisma.workout.create({
    data: {
      programId: pub.id,
      title: `Public-W-${TS}`,
      description: 'desc',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-15T10:00:00Z'),
    },
  })
  publicWorkoutId = pubWorkout.id

  // Gym-affiliated program (admin must NOT mutate)
  const gym = await prisma.gym.create({
    data: { name: `Admin-Mut-Gym-${TS}`, slug: `admin-mut-gym-${TS}`, timezone: 'UTC' },
  })
  affiliatedGymId = gym.id
  const affiliated = await prisma.program.create({
    data: {
      name: `Admin-Mut-Affiliated-${TS}`,
      visibility: 'PUBLIC',
      startDate: new Date('2026-04-01'),
      gyms: { create: { gymId: gym.id } },
    },
  })
  affiliatedProgramId = affiliated.id

  const affWorkout = await prisma.workout.create({
    data: {
      programId: affiliated.id,
      title: `Affiliated-W-${TS}`,
      description: 'desc',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-15T10:00:00Z'),
    },
  })
  affiliatedWorkoutId = affWorkout.id

  // Personal Program (ownerUserId != null) — admin must NOT mutate
  const pers = await prisma.program.create({
    data: {
      name: `Admin-Mut-Personal-${TS}`,
      visibility: 'PRIVATE',
      startDate: new Date('2026-04-01'),
      ownerUserId: personal.id,
    },
  })
  personalProgramId = pers.id

  console.log(`  admin=${adminUserId}`)
  console.log(`  public=${publicProgramId} affiliated=${affiliatedProgramId} personal=${personalProgramId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── POST /api/admin/programs ────────────────────────────────────────────────
  console.log('\n=== POST /api/admin/programs ===')
  let createdProgramId = ''
  {
    const r = await api('POST', '/admin/programs', undefined, { name: 'x', startDate: '2026-04-01' })
    check('T1: no auth → 401', 401, r.status)
  }
  {
    const r = await api('POST', '/admin/programs', nonAdminToken, { name: 'x', startDate: '2026-04-01' })
    check('T2: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('POST', '/admin/programs', adminToken, { name: '', startDate: '2026-04-01' })
    check('T3: admin invalid (empty name) → 400', 400, r.status)
  }
  {
    const r = await api('POST', '/admin/programs', adminToken, {
      name: `Admin-Mut-Created-${TS}`,
      description: 'created via admin',
      startDate: '2026-05-01',
    })
    check('T4: admin → 201', 201, r.status)
    const body = r.body as { id: string; visibility: string; name: string }
    check('T4: defaults visibility to PUBLIC', 'PUBLIC', body.visibility)
    check('T4: name persisted', `Admin-Mut-Created-${TS}`, body.name)
    createdProgramId = body.id
  }

  // ── PATCH /api/admin/programs/:id ───────────────────────────────────────────
  console.log('\n=== PATCH /api/admin/programs/:id ===')
  {
    const r = await api('PATCH', `/admin/programs/${publicProgramId}`, undefined, { name: 'y' })
    check('T5: no auth → 401', 401, r.status)
  }
  {
    const r = await api('PATCH', `/admin/programs/${publicProgramId}`, nonAdminToken, { name: 'y' })
    check('T6: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('PATCH', `/admin/programs/${publicProgramId}`, adminToken, {
      name: `Admin-Mut-Renamed-${TS}`,
    })
    check('T7: admin rename → 200', 200, r.status)
    check('T7: name updated', `Admin-Mut-Renamed-${TS}`, (r.body as { name: string }).name)
  }
  {
    const r = await api('PATCH', `/admin/programs/${affiliatedProgramId}`, adminToken, { name: 'shouldfail' })
    check('T8: admin PATCH affiliated → 404', 404, r.status)
  }
  {
    const r = await api('PATCH', `/admin/programs/${personalProgramId}`, adminToken, { name: 'shouldfail' })
    check('T9: admin PATCH personal → 404', 404, r.status)
  }

  // ── DELETE /api/admin/programs/:id ──────────────────────────────────────────
  console.log('\n=== DELETE /api/admin/programs/:id ===')
  {
    const r = await api('DELETE', `/admin/programs/${createdProgramId}`)
    check('T10: no auth → 401', 401, r.status)
  }
  {
    const r = await api('DELETE', `/admin/programs/${createdProgramId}`, nonAdminToken)
    check('T11: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('DELETE', `/admin/programs/${affiliatedProgramId}`, adminToken)
    check('T12: admin DELETE affiliated → 404', 404, r.status)
  }
  {
    const r = await api('DELETE', `/admin/programs/${personalProgramId}`, adminToken)
    check('T13: admin DELETE personal → 404', 404, r.status)
  }
  {
    const r = await api('DELETE', `/admin/programs/${createdProgramId}`, adminToken)
    check('T14: admin DELETE → 204', 204, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${createdProgramId}`, adminToken)
    check('T15: deleted program returns 404', 404, r.status)
  }

  // ── POST /api/admin/programs/:id/workouts ───────────────────────────────────
  console.log('\n=== POST /api/admin/programs/:id/workouts ===')
  let createdWorkoutId = ''
  {
    const r = await api('POST', `/admin/programs/${publicProgramId}/workouts`, nonAdminToken, {
      title: 'x', description: 'x', type: 'AMRAP', scheduledAt: '2026-05-01T10:00:00.000Z',
    })
    check('T16: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('POST', `/admin/programs/${affiliatedProgramId}/workouts`, adminToken, {
      title: 'x', description: 'x', type: 'AMRAP', scheduledAt: '2026-05-01T10:00:00.000Z',
    })
    check('T17: admin POST workout on affiliated → 404', 404, r.status)
  }
  {
    const r = await api('POST', `/admin/programs/${personalProgramId}/workouts`, adminToken, {
      title: 'x', description: 'x', type: 'AMRAP', scheduledAt: '2026-05-01T10:00:00.000Z',
    })
    check('T18: admin POST workout on personal → 404', 404, r.status)
  }
  {
    const r = await api('POST', `/admin/programs/${publicProgramId}/workouts`, adminToken, {
      title: `Admin-Mut-Workout-${TS}`,
      description: 'created via admin',
      type: 'FOR_TIME',
      scheduledAt: '2026-05-15T10:00:00.000Z',
    })
    check('T19: admin → 201', 201, r.status)
    const body = r.body as { id: string; status: string; programId: string }
    check('T19: programId from URL wins', publicProgramId, body.programId)
    check('T19: auto-PUBLISHED', 'PUBLISHED', body.status)
    createdWorkoutId = body.id
  }

  // ── PATCH /api/admin/workouts/:id ───────────────────────────────────────────
  console.log('\n=== PATCH /api/admin/workouts/:id ===')
  {
    const r = await api('PATCH', `/admin/workouts/${createdWorkoutId}`, nonAdminToken, { title: 'y' })
    check('T20: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('PATCH', `/admin/workouts/${affiliatedWorkoutId}`, adminToken, { title: 'shouldfail' })
    check('T21: admin PATCH affiliated workout → 404', 404, r.status)
  }
  {
    const r = await api('PATCH', `/admin/workouts/${createdWorkoutId}`, adminToken, {
      title: `Admin-Mut-Workout-Renamed-${TS}`,
    })
    check('T22: admin rename → 200', 200, r.status)
    check('T22: title updated', `Admin-Mut-Workout-Renamed-${TS}`, (r.body as { title: string }).title)
  }

  // ── DELETE /api/admin/workouts/:id ──────────────────────────────────────────
  console.log('\n=== DELETE /api/admin/workouts/:id ===')
  {
    const r = await api('DELETE', `/admin/workouts/${createdWorkoutId}`, nonAdminToken)
    check('T23: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('DELETE', `/admin/workouts/${affiliatedWorkoutId}`, adminToken)
    check('T24: admin DELETE affiliated workout → 404', 404, r.status)
  }
  {
    const r = await api('DELETE', `/admin/workouts/${createdWorkoutId}`, adminToken)
    check('T25: admin DELETE → 204', 204, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({ where: { id: { in: [publicWorkoutId, affiliatedWorkoutId] } } }).catch(() => {})
  await prisma.workout.deleteMany({ where: { programId: { in: [publicProgramId, affiliatedProgramId, personalProgramId] } } }).catch(() => {})
  await prisma.gymProgram.deleteMany({ where: { programId: affiliatedProgramId } }).catch(() => {})
  await prisma.program.delete({ where: { id: publicProgramId } }).catch(() => {})
  await prisma.program.delete({ where: { id: affiliatedProgramId } }).catch(() => {})
  await prisma.program.delete({ where: { id: personalProgramId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: affiliatedGymId } }).catch(() => {})
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {})
  await prisma.user.delete({ where: { id: personalUserId } }).catch(() => {})
  // Don't delete the admin user — shared across parallel test files.
  void adminUserId
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
