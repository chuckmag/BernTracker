/**
 * Integration tests for the WODalytics admin auth gate (slice 1 of #160).
 *
 * Covers:
 *   - parseAdminEmails / isAdminEmail unit behavior (CSV, trim, case-insensitive)
 *   - GET /api/auth/me returns isWodalyticsAdmin correctly for an allowlisted
 *     user, and false for a non-allowlisted user
 *
 * Requires: API running (default localhost:3000, or worktree-picked port via
 * API_URL), DB accessible via DATABASE_URL, WODALYTICS_ADMIN_EMAILS set in
 * .env to match what the API server is reading at request time.
 *
 * Run: cd apps/api && npx tsx tests/admin-auth.ts
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'
import { parseAdminEmails, isAdminEmail } from '../src/middleware/auth.js'

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
  return { status: res.status, body: json as Record<string, unknown> }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let adminUserId = ''
let nonAdminUserId = ''
let adminUserCreated = false
let adminToken = ''
let nonAdminToken = ''

async function setup() {
  console.log('\n=== Setup ===')

  // The API server reads WODALYTICS_ADMIN_EMAILS at request time. The test
  // must agree with whatever the server has loaded.
  const allowedRaw = process.env.WODALYTICS_ADMIN_EMAILS
  if (!allowedRaw) {
    throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env to run admin-auth tests')
  }
  const allowed = [...parseAdminEmails(allowedRaw)]
  if (allowed.length === 0) {
    throw new Error('WODALYTICS_ADMIN_EMAILS parsed to empty set — fix the env value')
  }
  const adminEmail = allowed[0]

  // Reuse the existing admin user if present; otherwise create a temp one.
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (existingAdmin) {
    adminUserId = existingAdmin.id
  } else {
    const created = await prisma.user.create({ data: { email: adminEmail } })
    adminUserId = created.id
    adminUserCreated = true
  }

  const nonAdmin = await prisma.user.create({ data: { email: `admin-test-nonadmin-${TS}@test.com` } })
  nonAdminUserId = nonAdmin.id

  adminToken = signTokenPair(adminUserId, 'OWNER').accessToken
  nonAdminToken = signTokenPair(nonAdminUserId, 'MEMBER').accessToken

  console.log(`  admin=${adminUserId} (${adminEmail})`)
  console.log(`  nonAdmin=${nonAdminUserId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function runUnitTests() {
  console.log('\n=== parseAdminEmails ===')
  {
    const set = parseAdminEmails(undefined)
    check('U1: undefined → empty set', 0, set.size)
  }
  {
    const set = parseAdminEmails('')
    check('U2: empty string → empty set', 0, set.size)
  }
  {
    const set = parseAdminEmails('a@x.com')
    check('U3: single email → size 1', 1, set.size)
    check('U3: contains a@x.com', true, set.has('a@x.com'))
  }
  {
    const set = parseAdminEmails(' A@X.com , b@y.com ,, ')
    check('U4: trims, lowercases, drops empties → size 2', 2, set.size)
    check('U4: contains a@x.com (lowercased)', true, set.has('a@x.com'))
    check('U4: contains b@y.com', true, set.has('b@y.com'))
  }

  console.log('\n=== isAdminEmail ===')
  // isAdminEmail reads process.env at call time, so this exercises the same
  // env the API server is using.
  const allowed = parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)
  const oneAllowed = [...allowed][0]
  check('U5: allowlisted email → true', true, isAdminEmail(oneAllowed))
  check('U6: case-insensitive match → true', true, isAdminEmail(oneAllowed.toUpperCase()))
  check('U7: random email → false', false, isAdminEmail(`random-${TS}@nowhere.test`))
  check('U8: null → false', false, isAdminEmail(null))
  check('U9: undefined → false', false, isAdminEmail(undefined))
}

async function runIntegrationTests() {
  console.log('\n=== GET /api/auth/me ===')
  {
    const r = await api('GET', '/auth/me', adminToken)
    check('T1: admin → 200', 200, r.status)
    check('T1: isWodalyticsAdmin=true', true, r.body.isWodalyticsAdmin)
  }
  {
    const r = await api('GET', '/auth/me', nonAdminToken)
    check('T2: non-admin → 200', 200, r.status)
    check('T2: isWodalyticsAdmin=false', false, r.body.isWodalyticsAdmin)
  }
  {
    const r = await api('GET', '/auth/me')
    check('T3: no auth → 401', 401, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.user.delete({ where: { id: nonAdminUserId } }).catch(() => {})
  if (adminUserCreated) await prisma.user.delete({ where: { id: adminUserId } }).catch(() => {})
  console.log('  cleaned up')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await setup()
    runUnitTests()
    await runIntegrationTests()
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
