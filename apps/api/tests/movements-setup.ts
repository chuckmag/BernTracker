/**
 * Integration tests for movement admin setup endpoints (#373).
 *
 * Covers auth gates (401 / 403) on admin-gated routes:
 *   GET  /movements?view=library  — admin-only library view
 *   PATCH /movements/:id           — admin update on ACTIVE or PENDING movement
 *   PATCH /movements/:id/review    — review with optional category + prTypes
 *
 * Admin happy-path tests (200 responses) require a real Keycloak token with
 * the 'admin' realm role — verify those flows manually against
 * qa.wodalytics.com.
 */

import { prisma } from '@wodalytics/db'
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
let memberUserId = ''
let memberToken = ''
let activeMovementId = ''
let pendingMovementId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const member = await prisma.user.create({ data: { email: `ms-member-${TS}@test.com` } })
  memberUserId = member.id
  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken

  activeMovementId = (
    await prisma.movement.create({
      data: { name: `MS-Active-${TS}`, status: 'ACTIVE', category: 'STRENGTH', prTypes: ['LOAD'] },
    })
  ).id

  pendingMovementId = (
    await prisma.movement.create({
      data: { name: `MS-Pending-${TS}`, status: 'PENDING' },
    })
  ).id

  console.log(`  member=${memberUserId}  active=${activeMovementId}  pending=${pendingMovementId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── GET /api/movements?view=library — auth gates ─────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  console.log('\n=== GET /api/movements?view=library — auth gates ===')

  {
    const r = await api('GET', '/movements?view=library')
    check('T1: library no auth → 401', 401, r.status)
  }

  {
    const r = await api('GET', '/movements?view=library', memberToken)
    check('T2: library non-admin (legacy token) → 403', 403, r.status)
  }

  // ── PATCH /api/movements/:id — auth gates ────────────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  console.log('\n=== PATCH /api/movements/:id — auth gates ===')

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`)
    check('T3: update movement no auth → 401', 401, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`, memberToken, { category: 'STRENGTH' })
    check('T4: update movement non-admin (legacy token) → 403', 403, r.status)
  }

  // ── PATCH /api/movements/:id/review — auth gates ─────────────────────────────
  // Admin happy-path (200) requires a Keycloak token with 'admin' realm role.
  console.log('\n=== PATCH /api/movements/:id/review — auth gates ===')

  {
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, undefined, { status: 'ACTIVE' })
    check('T5: review no auth → 401', 401, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${pendingMovementId}/review`, memberToken, { status: 'ACTIVE' })
    check('T6: review non-admin (legacy token) → 403', 403, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.movement.deleteMany({ where: { name: { endsWith: `-${TS}` } } }).catch(() => {})
  await prisma.user.delete({ where: { id: memberUserId } }).catch(() => {})
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
