/**
 * Integration tests for movement admin setup endpoints (#373).
 *
 * Covers:
 *   GET  /movements?view=library  — admin-only library view (ACTIVE + PENDING)
 *   PATCH /movements/:id           — admin update on ACTIVE or PENDING movement
 *   PATCH /movements/:id/review    — review with optional category + prTypes
 *
 * Requires: API running, DB accessible, WODALYTICS_ADMIN_EMAILS set in .env.
 */

import { prisma } from '@wodalytics/db'
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
let adminUserId = ''
let adminUserCreated = false
let memberUserId = ''
let adminToken = ''
let memberToken = ''

// movements used across tests
let activeMovementId = ''
let pendingForLibraryId = ''
let pendingForEditId = ''
let pendingForReviewId = ''
let rejectedMovementId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const allowed = [...parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)]
  if (allowed.length === 0) throw new Error('WODALYTICS_ADMIN_EMAILS must be set to run movements-setup tests')
  const adminEmail = allowed[0]

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (existing) {
    adminUserId = existing.id
  } else {
    const created = await prisma.user.create({ data: { email: adminEmail } })
    adminUserId = created.id
    adminUserCreated = true
  }

  const member = await prisma.user.create({ data: { email: `ms-member-${TS}@test.com` } })
  memberUserId = member.id

  adminToken = signTokenPair(adminUserId, 'MEMBER').accessToken
  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken

  activeMovementId = (
    await prisma.movement.create({
      data: {
        name: `MS-Active-${TS}`,
        status: 'ACTIVE',
        category: 'STRENGTH',
        prTypes: ['LOAD'],
      },
    })
  ).id

  pendingForLibraryId = (
    await prisma.movement.create({
      data: { name: `MS-Pending-Library-${TS}`, status: 'PENDING' },
    })
  ).id

  pendingForEditId = (
    await prisma.movement.create({
      data: { name: `MS-Pending-Edit-${TS}`, status: 'PENDING' },
    })
  ).id

  pendingForReviewId = (
    await prisma.movement.create({
      data: { name: `MS-Pending-Review-${TS}`, status: 'PENDING' },
    })
  ).id

  rejectedMovementId = (
    await prisma.movement.create({
      data: { name: `MS-Rejected-${TS}`, status: 'REJECTED' },
    })
  ).id

  console.log(`  admin=${adminUserId} (${adminEmail})`)
  console.log(`  active=${activeMovementId}  pendingLibrary=${pendingForLibraryId}`)
  console.log(`  pendingEdit=${pendingForEditId}  pendingReview=${pendingForReviewId}  rejected=${rejectedMovementId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── GET /api/movements?view=library ─────────────────────────────────────────
  console.log('\n=== GET /api/movements?view=library ===')

  {
    const r = await api('GET', '/movements?view=library')
    check('T1: library no auth → 401', 401, r.status)
  }

  {
    const r = await api('GET', '/movements?view=library', memberToken)
    check('T2: library non-admin → 403', 403, r.status)
  }

  {
    const r = await api('GET', '/movements?view=library', adminToken)
    check('T3: library admin → 200', 200, r.status)
    const arr = r.body as unknown as {
      id: string
      status: string
      category: string | null
      prTypes: string[]
      parentName: string | null
      variationCount: number
    }[]
    check('T3: returns array', true, Array.isArray(arr))
    check('T3: includes ACTIVE movement', true, arr.some((m) => m.id === activeMovementId))
    check('T3: includes PENDING movement', true, arr.some((m) => m.id === pendingForLibraryId))
    check('T3: excludes REJECTED movement', false, arr.some((m) => m.id === rejectedMovementId))

    const active = arr.find((m) => m.id === activeMovementId)!
    check('T3: active has status ACTIVE', 'ACTIVE', active.status)
    check('T3: active has category STRENGTH', 'STRENGTH', active.category)
    check('T3: active has prTypes [LOAD]', 'LOAD', active.prTypes[0])
    check('T3: active has parentName null', null, active.parentName)
    check('T3: active has variationCount 0', 0, active.variationCount)

    const pending = arr.find((m) => m.id === pendingForLibraryId)!
    check('T3: pending has status PENDING', 'PENDING', pending.status)
  }

  // ── PATCH /api/movements/:id (update ACTIVE movement) ───────────────────────
  console.log('\n=== PATCH /api/movements/:id (ACTIVE) ===')

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`, adminToken, {
      category: 'GYMNASTICS',
      prTypes: ['MAX_REPS'],
    })
    check('T4: update ACTIVE category + prTypes → 200', 200, r.status)
    check('T4: category updated', 'GYMNASTICS', r.body.category)
    check('T4: prTypes updated', 'MAX_REPS', (r.body.prTypes as string[])[0])
    check('T4: status still ACTIVE', 'ACTIVE', r.body.status)
  }

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`, adminToken, { name: `MS-Active-Renamed-${TS}` })
    check('T5: rename ACTIVE movement → 200', 200, r.status)
    check('T5: name updated', `MS-Active-Renamed-${TS}`, r.body.name)
  }

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`, memberToken, { category: 'STRENGTH' })
    check('T6: update ACTIVE as non-admin → 403', 403, r.status)
  }

  {
    const r = await api('PATCH', `/movements/${activeMovementId}`)
    check('T7: update ACTIVE no auth → 401', 401, r.status)
  }

  // ── PATCH /api/movements/:id (update PENDING movement) ──────────────────────
  console.log('\n=== PATCH /api/movements/:id (PENDING) ===')

  {
    const r = await api('PATCH', `/movements/${pendingForEditId}`, adminToken, {
      name: `MS-Pending-Edit-Renamed-${TS}`,
      category: 'MONOSTRUCTURAL',
      prTypes: ['DISTANCE', 'CALORIES'],
    })
    check('T8: update PENDING name + category + prTypes → 200', 200, r.status)
    check('T8: name updated', `MS-Pending-Edit-Renamed-${TS}`, r.body.name)
    check('T8: category updated', 'MONOSTRUCTURAL', r.body.category)
    check('T8: prTypes[0] DISTANCE', 'DISTANCE', (r.body.prTypes as string[])[0])
    check('T8: prTypes[1] CALORIES', 'CALORIES', (r.body.prTypes as string[])[1])
    check('T8: status still PENDING', 'PENDING', r.body.status)
  }

  // ── PATCH /api/movements/:id (REJECTED movement) ────────────────────────────
  console.log('\n=== PATCH /api/movements/:id (REJECTED) ===')

  {
    const r = await api('PATCH', `/movements/${rejectedMovementId}`, adminToken, { category: 'STRENGTH' })
    check('T9: update REJECTED movement → 400', 400, r.status)
  }

  // ── PATCH /api/movements/:id/review (with category + prTypes) ───────────────
  console.log('\n=== PATCH /api/movements/:id/review (with category + prTypes) ===')

  {
    const r = await api('PATCH', `/movements/${pendingForReviewId}/review`, adminToken, {
      status: 'ACTIVE',
      category: 'GYMNASTICS',
      prTypes: ['MAX_REPS'],
    })
    check('T10: review PENDING → ACTIVE with category + prTypes → 200', 200, r.status)
    check('T10: status ACTIVE', 'ACTIVE', r.body.status)
    check('T10: category set to GYMNASTICS', 'GYMNASTICS', r.body.category)
    check('T10: prTypes set to MAX_REPS', 'MAX_REPS', (r.body.prTypes as string[])[0])
  }

  {
    // Create a pending movement with STRENGTH category, reject with GYMNASTICS —
    // the category passed during rejection should be ignored, STRENGTH preserved.
    const toReject = await prisma.movement.create({
      data: { name: `MS-Reject-Test-${TS}`, status: 'PENDING', category: 'STRENGTH' },
    })
    const r = await api('PATCH', `/movements/${toReject.id}/review`, adminToken, {
      status: 'REJECTED',
      category: 'GYMNASTICS',
      prTypes: ['MAX_REPS'],
    })
    check('T11: review PENDING → REJECTED ignores category + prTypes → 200', 200, r.status)
    check('T11: status REJECTED', 'REJECTED', r.body.status)
    // category should remain STRENGTH (original), not the GYMNASTICS passed in the body
    check('T11: category unchanged on reject (STRENGTH)', 'STRENGTH', r.body.category)
    await prisma.movement.delete({ where: { id: toReject.id } }).catch(() => {})
  }

  {
    // Attempt to review an already-active movement
    const r = await api('PATCH', `/movements/${activeMovementId}/review`, adminToken, { status: 'ACTIVE' })
    check('T12: review non-PENDING movement → 400', 400, r.status)
  }

  // ── library view includes updated movements ──────────────────────────────────
  console.log('\n=== Library view reflects updates ===')

  {
    const r = await api('GET', '/movements?view=library', adminToken)
    const arr = r.body as unknown as { id: string; status: string; category: string | null }[]
    const reviewed = arr.find((m) => m.id === pendingForReviewId)
    check('T13: reviewed movement appears as ACTIVE in library', 'ACTIVE', reviewed?.status)
    check('T13: reviewed movement has GYMNASTICS category', 'GYMNASTICS', reviewed?.category)
    // pendingForReviewId is now ACTIVE — still in library
    check('T13: reviewed movement still in library', true, reviewed !== undefined)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.movement
    .deleteMany({ where: { name: { endsWith: `-${TS}` } } })
    .catch(() => {})
  await prisma.user.delete({ where: { id: memberUserId } }).catch(() => {})
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
