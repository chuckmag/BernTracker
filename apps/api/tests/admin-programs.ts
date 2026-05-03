/**
 * Integration tests for the WODalytics admin program endpoints (slice 2 of #160).
 *
 * Covers:
 *   - Auth gates (401 / 403 / 200) on /api/admin/programs[/<id>[/workouts]]
 *   - Listing returns unaffiliated programs but excludes gym-affiliated ones
 *   - Detail returns 404 for gym-affiliated or unknown programs
 *   - Workouts endpoint returns workouts for an unaffiliated program and
 *     404s for an affiliated one
 *
 * Requires: API running (default localhost:3000, or worktree-picked port via
 * API_URL), DB accessible via DATABASE_URL, WODALYTICS_ADMIN_EMAILS set in
 * .env to match what the API server is reading at request time.
 *
 * Run: cd apps/api && npx tsx tests/admin-programs.ts
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

async function api(method: string, path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers })
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
let adminUserCreated = false
let adminToken = ''
let nonAdminToken = ''
let unaffiliatedProgramId = ''
let affiliatedProgramId = ''
let unaffiliatedWorkoutId = ''
let affiliatedGymId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const allowed = [...parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)]
  if (allowed.length === 0) {
    throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env to run admin-programs tests')
  }
  const adminEmail = allowed[0]

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (existingAdmin) {
    adminUserId = existingAdmin.id
  } else {
    const created = await prisma.user.create({ data: { email: adminEmail } })
    adminUserId = created.id
    adminUserCreated = true
  }

  const nonAdmin = await prisma.user.create({ data: { email: `admin-prog-nonadmin-${TS}@test.com` } })
  nonAdminUserId = nonAdmin.id

  adminToken = signTokenPair(adminUserId, 'OWNER').accessToken
  nonAdminToken = signTokenPair(nonAdminUserId, 'MEMBER').accessToken

  // Unaffiliated program (admin should see it).
  const unaffiliated = await prisma.program.create({
    data: {
      name: `Admin-Unaffiliated-${TS}`,
      visibility: 'PUBLIC',
      startDate: new Date('2026-04-01'),
    },
  })
  unaffiliatedProgramId = unaffiliated.id

  // Workout under the unaffiliated program.
  const workout = await prisma.workout.create({
    data: {
      programId: unaffiliated.id,
      title: `Admin-Workout-${TS}`,
      description: 'For Time: 21-15-9 Thrusters / Pull-ups',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-15T10:00:00Z'),
    },
  })
  unaffiliatedWorkoutId = workout.id

  // Affiliated program (admin should NOT see it via this surface).
  const gym = await prisma.gym.create({
    data: { name: `Admin-Test-Gym-${TS}`, slug: `admin-test-gym-${TS}`, timezone: 'UTC' },
  })
  affiliatedGymId = gym.id
  const affiliated = await prisma.program.create({
    data: {
      name: `Admin-Affiliated-${TS}`,
      visibility: 'PUBLIC',
      startDate: new Date('2026-04-01'),
      gyms: { create: { gymId: gym.id } },
    },
  })
  affiliatedProgramId = affiliated.id

  console.log(`  admin=${adminUserId} (${adminEmail})`)
  console.log(`  unaffiliated=${unaffiliatedProgramId}  workout=${unaffiliatedWorkoutId}`)
  console.log(`  affiliated=${affiliatedProgramId}  gym=${affiliatedGymId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== GET /api/admin/programs ===')

  {
    const r = await api('GET', '/admin/programs')
    check('T1: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', '/admin/programs', nonAdminToken)
    check('T2: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('GET', '/admin/programs', adminToken)
    check('T3: admin → 200', 200, r.status)
    const arr = r.body as Array<{ id: string; name: string }>
    check('T3: returns array', true, Array.isArray(arr))
    check('T3: includes unaffiliated program', true, arr.some((p) => p.id === unaffiliatedProgramId))
    check('T3: excludes affiliated program', false, arr.some((p) => p.id === affiliatedProgramId))
  }

  console.log('\n=== GET /api/admin/programs/:id ===')
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}`)
    check('T4: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}`, nonAdminToken)
    check('T5: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}`, adminToken)
    check('T6: admin → 200', 200, r.status)
    const body = r.body as { id: string; _count: { workouts: number } }
    check('T6: id matches', unaffiliatedProgramId, body.id)
    check('T6: _count.workouts present', true, typeof body._count?.workouts === 'number')
  }
  {
    const r = await api('GET', `/admin/programs/${affiliatedProgramId}`, adminToken)
    check('T7: admin GET on affiliated program → 404', 404, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/does-not-exist-${TS}`, adminToken)
    check('T8: admin GET unknown id → 404', 404, r.status)
  }

  console.log('\n=== GET /api/admin/programs/:id/workouts ===')
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}/workouts`)
    check('T9: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}/workouts`, nonAdminToken)
    check('T10: non-admin → 403', 403, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}/workouts`, adminToken)
    check('T11: admin → 200', 200, r.status)
    const arr = r.body as Array<{ id: string; programId: string }>
    check('T11: returns array', true, Array.isArray(arr))
    check('T11: includes seeded workout', true, arr.some((w) => w.id === unaffiliatedWorkoutId))
    check('T11: every row tagged with the program', true, arr.every((w) => w.programId === unaffiliatedProgramId))
  }
  {
    const r = await api('GET', `/admin/programs/${affiliatedProgramId}/workouts`, adminToken)
    check('T12: admin workouts on affiliated program → 404', 404, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({ where: { programId: { in: [unaffiliatedProgramId, affiliatedProgramId] } } }).catch(() => {})
  await prisma.gymProgram.deleteMany({ where: { programId: affiliatedProgramId } }).catch(() => {})
  await prisma.program.delete({ where: { id: unaffiliatedProgramId } }).catch(() => {})
  await prisma.program.delete({ where: { id: affiliatedProgramId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: affiliatedGymId } }).catch(() => {})
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {})
  if (adminUserCreated) await prisma.user.delete({ where: { id: adminUserId } }).catch(() => {})
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
