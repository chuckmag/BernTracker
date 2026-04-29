/**
 * Integration tests for the user→gym join-request flow (slice D2 of #120).
 *
 * Requires: API running, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/gymJoinRequests.ts
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

let gymId = ''
let otherGymId = ''
let ownerId = '', ownerToken = ''
let coachId = '', coachToken = ''
let memberId = '', memberToken = ''
let outsiderId = '', outsiderToken = ''
let outsider2Id = '', outsider2Token = ''

async function setup() {
  console.log('\n=== Setup ===')
  const [gym, otherGym] = await Promise.all([
    prisma.gym.create({ data: { name: `Join Gym ${TS}`, slug: `join-${TS}`, timezone: 'UTC' } }),
    prisma.gym.create({ data: { name: `Join Other ${TS}`, slug: `join-other-${TS}`, timezone: 'UTC' } }),
  ])
  gymId = gym.id
  otherGymId = otherGym.id

  const [owner, coach, member, outsider, outsider2] = await Promise.all([
    prisma.user.create({ data: { email: `join-owner-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `join-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `join-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `join-outsider-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `join-outsider2-${TS}@test.com` } }),
  ])
  ownerId = owner.id
  coachId = coach.id
  memberId = member.id
  outsiderId = outsider.id
  outsider2Id = outsider2.id

  await prisma.userGym.createMany({
    data: [
      { userId: ownerId, gymId, role: 'OWNER' },
      { userId: coachId, gymId, role: 'COACH' },
      { userId: memberId, gymId, role: 'MEMBER' },
    ],
  })

  ownerToken = signTokenPair(ownerId, 'OWNER').accessToken
  coachToken = signTokenPair(coachId, 'COACH').accessToken
  memberToken = signTokenPair(memberId, 'MEMBER').accessToken
  outsiderToken = signTokenPair(outsiderId, 'MEMBER').accessToken
  outsider2Token = signTokenPair(outsider2Id, 'MEMBER').accessToken
  console.log(`  setup ok — gym=${gymId} owner=${ownerId} outsider=${outsiderId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.gymMembershipRequest.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } })
  await prisma.userGym.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } })
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: [ownerId, coachId, memberId, outsiderId, outsider2Id] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, coachId, memberId, outsiderId, outsider2Id] } },
  })
  await prisma.gym.deleteMany({ where: { id: { in: [gymId, otherGymId] } } })
  console.log('  teardown ok')
}

async function testAuthGuards() {
  console.log('\n=== Auth guards ===')
  check('GET /gyms (browse) without token → 401',
    401, (await api('GET', '/gyms')).status)
  check('POST /gyms/:id/join-request without token → 401',
    401, (await api('POST', `/gyms/${gymId}/join-request`)).status)
  check('GET /gyms/:id/join-requests without token → 401',
    401, (await api('GET', `/gyms/${gymId}/join-requests`)).status)
  check('GET /gyms/:id/join-requests as MEMBER → 403',
    403, (await api('GET', `/gyms/${gymId}/join-requests`, memberToken)).status)
  check('GET /users/me/join-requests without token → 401',
    401, (await api('GET', '/users/me/join-requests')).status)
}

async function testBrowseGyms() {
  console.log('\n=== GET /gyms (browse) ===')
  const r = await api('GET', '/gyms', outsiderToken)
  check('200', 200, r.status)
  const list = r.body as unknown as { id: string; name: string; memberCount: number; callerStatus: string }[]
  const ours = list.find((g) => g.id === gymId)
  check('result includes our gym', true, !!ours)
  check('memberCount populated', 3, ours?.memberCount)
  check('callerStatus = NONE for outsider', 'NONE', ours?.callerStatus)

  const rMember = await api('GET', '/gyms', memberToken)
  const memberList = rMember.body as unknown as { id: string; callerStatus: string }[]
  const ourGymForMember = memberList.find((g) => g.id === gymId)
  check('callerStatus = MEMBER for actual member', 'MEMBER', ourGymForMember?.callerStatus)

  // Search filter
  const rSearch = await api('GET', `/gyms?search=Join+Gym+${TS}`, outsiderToken)
  const searchList = rSearch.body as unknown as { id: string }[]
  check('search narrows to matching gyms', true, searchList.length >= 1 && searchList.every((g) => g.id === gymId || g.id === otherGymId))
  check('search excludes Other gym (case-insensitive name match)', false, searchList.some((g) => g.id === otherGymId))
}

async function testCreateJoinRequest() {
  console.log('\n=== POST /gyms/:id/join-request ===')
  const r = await api('POST', `/gyms/${gymId}/join-request`, outsiderToken)
  check('outsider creates pending request → 201', 201, r.status)
  check('direction=USER_REQUESTED', 'USER_REQUESTED', r.body.direction)
  check('status=PENDING', 'PENDING', r.body.status)
  check('userId = outsiderId', outsiderId, r.body.userId)

  const rDup = await api('POST', `/gyms/${gymId}/join-request`, outsiderToken)
  check('duplicate request → 409', 409, rDup.status)

  const rMember = await api('POST', `/gyms/${gymId}/join-request`, memberToken)
  check('existing-member request → 409', 409, rMember.status)

  // Browse now reports REQUEST_PENDING for outsider.
  const rBrowse = await api('GET', '/gyms', outsiderToken)
  const list = rBrowse.body as unknown as { id: string; callerStatus: string }[]
  const ours = list.find((g) => g.id === gymId)
  check('browse reflects REQUEST_PENDING', 'REQUEST_PENDING', ours?.callerStatus)
}

async function testListAndApprove() {
  console.log('\n=== Staff list + approve ===')
  // Outsider2 also requests, so we have two pending.
  await api('POST', `/gyms/${gymId}/join-request`, outsider2Token)

  const rList = await api('GET', `/gyms/${gymId}/join-requests`, ownerToken)
  check('OWNER list → 200', 200, rList.status)
  check('list size = 2', 2, (rList.body as unknown as unknown[]).length)

  const rCoachList = await api('GET', `/gyms/${gymId}/join-requests`, coachToken)
  check('COACH can list join requests', 200, rCoachList.status)

  const list = rList.body as unknown as { id: string; userId: string }[]
  const outsiderRequest = list.find((r) => r.userId === outsiderId)!

  const rApprove = await api('POST', `/gyms/${gymId}/join-requests/${outsiderRequest.id}/approve`, ownerToken)
  check('OWNER approve → 200', 200, rApprove.status)
  check('status=APPROVED', 'APPROVED', rApprove.body.status)

  const membership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId: outsiderId, gymId } },
  })
  check('UserGym created with role=MEMBER', 'MEMBER', membership?.role)

  const rApproveAgain = await api('POST', `/gyms/${gymId}/join-requests/${outsiderRequest.id}/approve`, ownerToken)
  check('approve already-approved → 409', 409, rApproveAgain.status)
}

async function testDecline() {
  console.log('\n=== Staff decline ===')
  const rList = await api('GET', `/gyms/${gymId}/join-requests`, ownerToken)
  const remaining = rList.body as unknown as { id: string; userId: string }[]
  const outsider2Request = remaining.find((r) => r.userId === outsider2Id)!

  const rDecline = await api('POST', `/gyms/${gymId}/join-requests/${outsider2Request.id}/decline`, ownerToken)
  check('OWNER decline → 200', 200, rDecline.status)
  check('status=DECLINED', 'DECLINED', rDecline.body.status)

  const noMembership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId: outsider2Id, gymId } },
  })
  check('no UserGym after decline', 'null', JSON.stringify(noMembership))
}

async function testCancelMine() {
  console.log('\n=== User cancels own pending request ===')
  // Re-issue a fresh request from outsider2 → cancel it from the user side.
  await prisma.gymMembershipRequest.create({
    data: {
      gymId: otherGymId,
      direction: 'USER_REQUESTED',
      userId: outsider2Id,
      roleToGrant: 'MEMBER',
    },
  })
  const rCancel = await api('DELETE', `/gyms/${otherGymId}/join-request`, outsider2Token)
  check('user cancel own → 200', 200, rCancel.status)
  check('status=REVOKED', 'REVOKED', rCancel.body.status)

  const rNotFound = await api('DELETE', `/gyms/${otherGymId}/join-request`, outsider2Token)
  check('cancel when none pending → 404', 404, rNotFound.status)
}

async function testListMyJoinRequests() {
  console.log('\n=== GET /users/me/join-requests ===')
  await prisma.gymMembershipRequest.create({
    data: {
      gymId: otherGymId,
      direction: 'USER_REQUESTED',
      userId: outsider2Id,
      roleToGrant: 'MEMBER',
    },
  })

  const r = await api('GET', '/users/me/join-requests', outsider2Token)
  check('200', 200, r.status)
  const list = r.body as unknown as { gymId: string; status: string }[]
  check('returns the pending request', true, list.some((req) => req.gymId === otherGymId && req.status === 'PENDING'))

  const rOther = await api('GET', '/users/me/join-requests', outsiderToken)
  const otherList = rOther.body as unknown as unknown[]
  check('returns nothing for the now-approved outsider', 0, otherList.length)
}

async function main() {
  try {
    await setup()
    await testAuthGuards()
    await testBrowseGyms()
    await testCreateJoinRequest()
    await testListAndApprove()
    await testDecline()
    await testCancelMine()
    await testListMyJoinRequests()
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
