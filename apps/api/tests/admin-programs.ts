/**
 * Integration tests for the WODalytics admin program read endpoints.
 *
 * Covers auth gates (401 / 403) on /api/admin/programs[/<id>[/workouts]].
 * The admin happy-path (200 responses, filtering behavior) requires a real
 * Keycloak token with the 'admin' realm role — verify those flows manually
 * against qa.wodalytics.com.
 *
 * Run: cd apps/api && npx tsx tests/admin-programs.ts
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
let unaffiliatedProgramId = ''
let affiliatedProgramId = ''
let affiliatedGymId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const nonAdmin = await prisma.user.create({ data: { email: `admin-prog-nonadmin-${TS}@test.com` } })
  nonAdminUserId = nonAdmin.id
  nonAdminToken = signTokenPair(nonAdminUserId, 'MEMBER').accessToken

  const unaffiliated = await prisma.program.create({
    data: { name: `Admin-Unaffiliated-${TS}`, visibility: 'PUBLIC', startDate: new Date('2026-04-01') },
  })
  unaffiliatedProgramId = unaffiliated.id

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

  console.log(`  nonAdmin=${nonAdminUserId}`)
  console.log(`  unaffiliated=${unaffiliatedProgramId}  affiliated=${affiliatedProgramId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== GET /api/admin/programs — auth gates ===')
  {
    const r = await api('GET', '/admin/programs')
    check('T1: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', '/admin/programs', nonAdminToken)
    check('T2: non-admin (legacy token) → 403', 403, r.status)
  }

  console.log('\n=== GET /api/admin/programs/:id — auth gates ===')
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}`)
    check('T3: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}`, nonAdminToken)
    check('T4: non-admin → 403', 403, r.status)
  }

  console.log('\n=== GET /api/admin/programs/:id/workouts — auth gates ===')
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}/workouts`)
    check('T5: no auth → 401', 401, r.status)
  }
  {
    const r = await api('GET', `/admin/programs/${unaffiliatedProgramId}/workouts`, nonAdminToken)
    check('T6: non-admin → 403', 403, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.gymProgram.deleteMany({ where: { programId: affiliatedProgramId } }).catch(() => {})
  await prisma.program.deleteMany({ where: { id: { in: [unaffiliatedProgramId, affiliatedProgramId] } } }).catch(() => {})
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
