/**
 * Integration tests for the WODalytics admin mutating endpoints.
 *
 * Covers auth gates (401 / 403) on every admin mutation route. The admin
 * happy-path (201 / 200 / 204 responses) requires a real Keycloak token with
 * the 'admin' realm role, which is only available in QA/prod — verify those
 * flows manually against qa.wodalytics.com.
 *
 * Run: cd apps/api && npx tsx tests/admin-programs-mutations.ts
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
let nonAdminUserId = ''
let nonAdminToken = ''
let publicProgramId = ''
let affiliatedProgramId = ''
let publicWorkoutId = ''
let affiliatedWorkoutId = ''
let affiliatedGymId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const nonAdmin = await prisma.user.create({ data: { email: `admin-mut-nonadmin-${TS}@test.com` } })
  nonAdminUserId = nonAdmin.id
  nonAdminToken = signTokenPair(nonAdminUserId, 'MEMBER').accessToken

  const pub = await prisma.program.create({
    data: { name: `Admin-Mut-Public-${TS}`, visibility: 'PUBLIC', startDate: new Date('2026-04-01') },
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

  console.log(`  nonAdmin=${nonAdminUserId}`)
  console.log(`  public=${publicProgramId} affiliated=${affiliatedProgramId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== POST /api/admin/programs — auth gates ===')
  {
    const r = await api('POST', '/admin/programs', undefined, { name: 'x', startDate: '2026-04-01' })
    check('T1: no auth → 401', 401, r.status)
  }
  {
    const r = await api('POST', '/admin/programs', nonAdminToken, { name: 'x', startDate: '2026-04-01' })
    check('T2: non-admin (legacy token) → 403', 403, r.status)
  }

  console.log('\n=== PATCH /api/admin/programs/:id — auth gates ===')
  {
    const r = await api('PATCH', `/admin/programs/${publicProgramId}`, undefined, { name: 'y' })
    check('T3: no auth → 401', 401, r.status)
  }
  {
    const r = await api('PATCH', `/admin/programs/${publicProgramId}`, nonAdminToken, { name: 'y' })
    check('T4: non-admin → 403', 403, r.status)
  }

  console.log('\n=== DELETE /api/admin/programs/:id — auth gates ===')
  {
    const r = await api('DELETE', `/admin/programs/${publicProgramId}`)
    check('T5: no auth → 401', 401, r.status)
  }
  {
    const r = await api('DELETE', `/admin/programs/${publicProgramId}`, nonAdminToken)
    check('T6: non-admin → 403', 403, r.status)
  }

  console.log('\n=== POST /api/admin/programs/:id/workouts — auth gates ===')
  {
    const r = await api('POST', `/admin/programs/${publicProgramId}/workouts`, undefined, {
      title: 'x', description: 'x', type: 'AMRAP', scheduledAt: '2026-05-01T10:00:00.000Z',
    })
    check('T7: no auth → 401', 401, r.status)
  }
  {
    const r = await api('POST', `/admin/programs/${publicProgramId}/workouts`, nonAdminToken, {
      title: 'x', description: 'x', type: 'AMRAP', scheduledAt: '2026-05-01T10:00:00.000Z',
    })
    check('T8: non-admin → 403', 403, r.status)
  }

  console.log('\n=== PATCH /api/admin/workouts/:id — auth gates ===')
  {
    const r = await api('PATCH', `/admin/workouts/${publicWorkoutId}`, undefined, { title: 'y' })
    check('T9: no auth → 401', 401, r.status)
  }
  {
    const r = await api('PATCH', `/admin/workouts/${publicWorkoutId}`, nonAdminToken, { title: 'y' })
    check('T10: non-admin → 403', 403, r.status)
  }

  console.log('\n=== POST /api/admin/workouts/:id/publish — auth gates ===')
  {
    const r = await api('POST', `/admin/workouts/${publicWorkoutId}/publish`)
    check('T11: no auth → 401', 401, r.status)
  }
  {
    const r = await api('POST', `/admin/workouts/${publicWorkoutId}/publish`, nonAdminToken)
    check('T12: non-admin → 403', 403, r.status)
  }

  console.log('\n=== DELETE /api/admin/workouts/:id — auth gates ===')
  {
    const r = await api('DELETE', `/admin/workouts/${publicWorkoutId}`, undefined)
    check('T13: no auth → 401', 401, r.status)
  }
  {
    const r = await api('DELETE', `/admin/workouts/${affiliatedWorkoutId}`, nonAdminToken)
    check('T14: non-admin → 403', 403, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({ where: { id: { in: [publicWorkoutId, affiliatedWorkoutId] } } }).catch(() => {})
  await prisma.gymProgram.deleteMany({ where: { programId: affiliatedProgramId } }).catch(() => {})
  await prisma.program.deleteMany({ where: { id: { in: [publicProgramId, affiliatedProgramId] } } }).catch(() => {})
  await prisma.gym.delete({ where: { id: affiliatedGymId } }).catch(() => {})
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {})
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
