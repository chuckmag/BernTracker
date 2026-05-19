/**
 * Integration tests for the WODalytics admin auth gate.
 *
 * Covers:
 *   - GET /api/auth/me returns isWodalyticsAdmin:false for legacy JWT tokens
 *     (legacy tokens carry no Keycloak realm roles, so admin is always false)
 *   - requireWodalyticsAdmin routes return 403 for non-admin tokens
 *   - requireWodalyticsAdmin routes return 401 for unauthenticated requests
 *
 * The Keycloak-token path (isWodalyticsAdmin:true) requires a real KC token
 * with the 'admin' realm role. That path is validated manually in QA against
 * a user with the Keycloak 'admin' realm role assigned.
 *
 * Run: cd apps/api && npx tsx tests/admin-auth.ts
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
  return { status: res.status, body: json as Record<string, unknown> }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let userId = ''
let token = ''

async function setup() {
  console.log('\n=== Setup ===')
  const user = await prisma.user.create({ data: { email: `admin-test-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'OWNER').accessToken
  console.log(`  userId=${userId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== GET /api/auth/me ===')
  {
    const r = await api('GET', '/auth/me', token)
    check('T1: legacy token → 200', 200, r.status)
    check('T1: isWodalyticsAdmin=false (legacy tokens carry no KC realm roles)', false, r.body.isWodalyticsAdmin)
  }
  {
    const r = await api('GET', '/auth/me')
    check('T2: no auth → 401', 401, r.status)
  }

  console.log('\n=== Admin-gated routes (requireWodalyticsAdmin) ===')
  {
    const r = await api('GET', '/admin/programs', token)
    check('T3: legacy token on admin route → 403', 403, r.status)
  }
  {
    const r = await api('GET', '/admin/programs')
    check('T4: no auth on admin route → 401', 401, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.user.delete({ where: { id: userId } }).catch(() => {})
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
