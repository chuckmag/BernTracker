/**
 * Integration tests for user profile + emergency contact endpoints (slice B of #120).
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/userProfile.ts
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
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

const TS = Date.now()
let aliceId = ''
let aliceToken = ''
let bobId = ''
let bobToken = ''
const createdContactIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const [alice, bob] = await Promise.all([
    prisma.user.create({ data: { email: `up-alice-${TS}@test.com`, name: 'Alice Existing' } }),
    prisma.user.create({ data: { email: `up-bob-${TS}@test.com` } }),
  ])
  aliceId = alice.id
  bobId = bob.id
  aliceToken = signTokenPair(alice.id, alice.role).accessToken
  bobToken = signTokenPair(bob.id, bob.role).accessToken
  console.log(`  setup ok — alice=${aliceId} bob=${bobId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.emergencyContact.deleteMany({ where: { userId: { in: [aliceId, bobId] } } })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [aliceId, bobId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } })
  console.log('  teardown ok')
}

async function testAuthGuards() {
  console.log('\n=== Auth guards ===')
  check('GET /users/me/profile without token → 401',
    401, (await api('GET', '/users/me/profile')).status)
  check('PATCH /users/me/profile without token → 401',
    401, (await api('PATCH', '/users/me/profile', undefined, { firstName: 'X' })).status)
  check('GET /users/me/emergency-contacts without token → 401',
    401, (await api('GET', '/users/me/emergency-contacts')).status)
  check('POST /users/me/emergency-contacts without token → 401',
    401, (await api('POST', '/users/me/emergency-contacts', undefined, { name: 'X', phone: '1' })).status)
}

async function testGetProfile() {
  console.log('\n=== GET /users/me/profile ===')
  const r = await api('GET', '/users/me/profile', aliceToken)
  check('returns 200', 200, r.status)
  check('includes id', aliceId, r.body.id)
  check('includes email', `up-alice-${TS}@test.com`, r.body.email)
  check('emergencyContacts is empty array', '[]', JSON.stringify(r.body.emergencyContacts))
  check('onboardedAt initially null', 'null', JSON.stringify(r.body.onboardedAt))
}

async function testPatchProfile() {
  console.log('\n=== PATCH /users/me/profile ===')

  const r1 = await api('PATCH', '/users/me/profile', aliceToken, {
    firstName: 'Alice',
    lastName: 'Anderson',
    birthday: '1990-04-15',
    identifiedGender: 'FEMALE',
  })
  check('200 on full profile update', 200, r1.status)
  check('firstName persisted', 'Alice', r1.body.firstName)
  check('lastName persisted', 'Anderson', r1.body.lastName)
  check('identifiedGender persisted', 'FEMALE', r1.body.identifiedGender)
  // Emergency contacts are NOT part of the onboarding floor — onboardedAt
  // should auto-stamp once the four profile fields are set.
  check('onboardedAt set after profile fields are complete', 'string', typeof r1.body.onboardedAt)

  const rBad = await api('PATCH', '/users/me/profile', aliceToken, { birthday: 'not-a-date' })
  check('400 on invalid birthday format', 400, rBad.status)

  const rUnknown = await api('PATCH', '/users/me/profile', aliceToken, { foo: 'bar' })
  check('400 on unknown field (strict schema)', 400, rUnknown.status)
}

async function testEmergencyContactCrud() {
  console.log('\n=== Emergency contact CRUD ===')

  const r1 = await api('POST', '/users/me/emergency-contacts', aliceToken, {
    name: 'Bob Anderson',
    relationship: 'Spouse',
    phone: '555-1234',
    email: 'bob-spouse@test.com',
  })
  check('POST returns 201', 201, r1.status)
  check('contact name persisted', 'Bob Anderson', r1.body.name)
  const contactId = r1.body.id as string
  createdContactIds.push(contactId)

  const rBad = await api('POST', '/users/me/emergency-contacts', aliceToken, {
    name: '',
    phone: '555-1111',
  })
  check('400 on empty name', 400, rBad.status)

  const rList = await api('GET', '/users/me/emergency-contacts', aliceToken)
  check('GET list returns 200', 200, rList.status)
  check('list has 1 contact', 1, (rList.body as unknown as unknown[]).length)

  const rPatch = await api('PATCH', `/users/me/emergency-contacts/${contactId}`, aliceToken, {
    phone: '555-9999',
  })
  check('PATCH returns 200', 200, rPatch.status)
  check('phone updated', '555-9999', rPatch.body.phone)

  const rWrongUser = await api('PATCH', `/users/me/emergency-contacts/${contactId}`, bobToken, {
    phone: '999',
  })
  check('PATCH another user\'s contact → 404', 404, rWrongUser.status)

  // Contacts are optional now — deleting the only contact is allowed even
  // for an onboarded user.
  const rDel = await api('DELETE', `/users/me/emergency-contacts/${contactId}`, aliceToken)
  check('DELETE returns 204', 204, rDel.status)

  const rDelMissing = await api('DELETE', `/users/me/emergency-contacts/${contactId}`, aliceToken)
  check('DELETE on already-removed contact → 404', 404, rDelMissing.status)
}

async function testOnboardedAtIdempotent() {
  console.log('\n=== onboardedAt idempotency ===')
  const before = await prisma.user.findUnique({ where: { id: aliceId }, select: { onboardedAt: true } })
  // Subsequent PATCH should NOT re-stamp onboardedAt.
  await new Promise((r) => setTimeout(r, 5))
  await api('PATCH', '/users/me/profile', aliceToken, { firstName: 'Alicia' })
  const after = await prisma.user.findUnique({ where: { id: aliceId }, select: { onboardedAt: true } })
  check('onboardedAt unchanged on subsequent updates',
    String(before?.onboardedAt?.toISOString()),
    String(after?.onboardedAt?.toISOString()))
}

async function testAuthMeIncludesNewFields() {
  console.log('\n=== /api/auth/me includes new profile fields ===')
  const r = await api('GET', '/auth/me', aliceToken)
  check('200', 200, r.status)
  check('me.firstName', 'Alicia', r.body.firstName)
  check('me.onboardedAt set', 'string', typeof r.body.onboardedAt)
  check('me.birthday set', 'string', typeof r.body.birthday)
}

async function main() {
  try {
    await setup()
    await testAuthGuards()
    await testGetProfile()
    await testPatchProfile()
    await testEmergencyContactCrud()
    await testOnboardedAtIdempotent()
    await testAuthMeIncludesNewFields()
  } catch (err) {
    console.error('Test run threw:', err)
    fail++
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
