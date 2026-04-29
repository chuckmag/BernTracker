/**
 * Integration tests for staff→user gym invitations (slice D1 of #120).
 *
 * Requires: API running, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/gymInvitations.ts
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
let programmerId = '', programmerToken = ''
let coachId = '', coachToken = ''
let memberId = '', memberToken = ''
let inviteeId = '', inviteeToken = ''
let strangerId = '', strangerToken = ''
const createdInviteIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const [gym, otherGym] = await Promise.all([
    prisma.gym.create({ data: { name: `Inv Gym ${TS}`, slug: `inv-${TS}`, timezone: 'UTC' } }),
    prisma.gym.create({ data: { name: `Inv Other ${TS}`, slug: `inv-other-${TS}`, timezone: 'UTC' } }),
  ])
  gymId = gym.id
  otherGymId = otherGym.id

  const [owner, programmer, coach, member, invitee, stranger] = await Promise.all([
    prisma.user.create({ data: { email: `inv-owner-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `inv-prog-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `inv-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `inv-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `inv-invitee-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `inv-stranger-${TS}@test.com` } }),
  ])
  ownerId = owner.id
  programmerId = programmer.id
  coachId = coach.id
  memberId = member.id
  inviteeId = invitee.id
  strangerId = stranger.id

  await prisma.userGym.createMany({
    data: [
      { userId: ownerId, gymId, role: 'OWNER' },
      { userId: programmerId, gymId, role: 'PROGRAMMER' },
      { userId: coachId, gymId, role: 'COACH' },
      { userId: memberId, gymId, role: 'MEMBER' },
    ],
  })

  ownerToken = signTokenPair(ownerId, 'OWNER').accessToken
  programmerToken = signTokenPair(programmerId, 'PROGRAMMER').accessToken
  coachToken = signTokenPair(coachId, 'COACH').accessToken
  memberToken = signTokenPair(memberId, 'MEMBER').accessToken
  inviteeToken = signTokenPair(inviteeId, 'MEMBER').accessToken
  strangerToken = signTokenPair(strangerId, 'MEMBER').accessToken
  console.log(`  setup ok — gym=${gymId} owner=${ownerId} invitee=${inviteeId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.gymMembershipRequest.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } })
  await prisma.userGym.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } })
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: [ownerId, programmerId, coachId, memberId, inviteeId, strangerId] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, programmerId, coachId, memberId, inviteeId, strangerId] } },
  })
  await prisma.gym.deleteMany({ where: { id: { in: [gymId, otherGymId] } } })
  console.log('  teardown ok')
}

async function testAuthGuards() {
  console.log('\n=== Auth guards ===')
  check('GET /gyms/:id/invitations without token → 401',
    401, (await api('GET', `/gyms/${gymId}/invitations`)).status)
  check('POST /gyms/:id/invitations without token → 401',
    401, (await api('POST', `/gyms/${gymId}/invitations`, undefined, { email: 'x@test.com' })).status)
  check('GET /gyms/:id/invitations as MEMBER → 403',
    403, (await api('GET', `/gyms/${gymId}/invitations`, memberToken)).status)
  check('POST /gyms/:id/invitations as MEMBER → 403',
    403, (await api('POST', `/gyms/${gymId}/invitations`, memberToken, { email: 'x@test.com' })).status)
  check('GET /users/me/invitations without token → 401',
    401, (await api('GET', '/users/me/invitations')).status)
}

async function testCreateInvitation() {
  console.log('\n=== Create invitation ===')

  const r = await api('POST', `/gyms/${gymId}/invitations`, ownerToken, {
    email: `invitee-${TS}@test.com`,
    roleToGrant: 'MEMBER',
  })
  check('OWNER creates pending invitation → 201', 201, r.status)
  check('direction=STAFF_INVITED', 'STAFF_INVITED', r.body.direction)
  check('status=PENDING', 'PENDING', r.body.status)
  check('email lowercased', `invitee-${TS}@test.com`, r.body.email)
  check('userId null (not yet user)', 'null', JSON.stringify(r.body.userId))
  createdInviteIds.push(r.body.id as string)

  // Existing user → userId resolved
  const r2 = await api('POST', `/gyms/${gymId}/invitations`, ownerToken, {
    email: `inv-invitee-${TS}@test.com`,
    roleToGrant: 'COACH',
  })
  check('existing-user invite → 201', 201, r2.status)
  check('userId resolved on invite', inviteeId, r2.body.userId)
  createdInviteIds.push(r2.body.id as string)

  // Dup pending → 409
  const rDup = await api('POST', `/gyms/${gymId}/invitations`, ownerToken, {
    email: `invitee-${TS}@test.com`,
    roleToGrant: 'MEMBER',
  })
  check('dup pending invite → 409', 409, rDup.status)

  // Already-member → 409
  const rExisting = await api('POST', `/gyms/${gymId}/invitations`, ownerToken, {
    email: `inv-member-${TS}@test.com`,
    roleToGrant: 'MEMBER',
  })
  check('inviting existing member → 409', 409, rExisting.status)

  // Role elevation: COACH → can't grant PROGRAMMER
  const rEsc = await api('POST', `/gyms/${gymId}/invitations`, coachToken, {
    email: `coach-tries-prog-${TS}@test.com`,
    roleToGrant: 'PROGRAMMER',
  })
  check('COACH grant PROGRAMMER → 403', 403, rEsc.status)

  // PROGRAMMER → can grant COACH
  const rProgGrantsCoach = await api('POST', `/gyms/${gymId}/invitations`, programmerToken, {
    email: `prog-grants-coach-${TS}@test.com`,
    roleToGrant: 'COACH',
  })
  check('PROGRAMMER grant COACH → 201', 201, rProgGrantsCoach.status)
  createdInviteIds.push(rProgGrantsCoach.body.id as string)

  // PROGRAMMER → can't grant OWNER
  const rProgOwner = await api('POST', `/gyms/${gymId}/invitations`, programmerToken, {
    email: `prog-tries-owner-${TS}@test.com`,
    roleToGrant: 'OWNER',
  })
  check('PROGRAMMER grant OWNER → 403', 403, rProgOwner.status)

  // Bad email → 400
  const rBad = await api('POST', `/gyms/${gymId}/invitations`, ownerToken, { email: 'not-an-email' })
  check('invalid email → 400', 400, rBad.status)
}

async function testListInvitations() {
  console.log('\n=== List invitations ===')
  const r = await api('GET', `/gyms/${gymId}/invitations`, ownerToken)
  check('200', 200, r.status)
  const list = r.body as unknown as { gymId: string; status: string }[]
  check('returns this gym\'s invites only', true, list.every((i) => i.gymId === gymId))
  check('list size = 3 created above', 3, list.length)

  // COACH can read (read access on the panel)
  const rCoach = await api('GET', `/gyms/${gymId}/invitations`, coachToken)
  check('COACH list → 200', 200, rCoach.status)
}

async function testRevoke() {
  console.log('\n=== Revoke ===')
  const inviteId = createdInviteIds[2] // PROGRAMMER's COACH invite
  const r = await api('POST', `/gyms/${gymId}/invitations/${inviteId}/revoke`, ownerToken)
  check('OWNER revoke → 200', 200, r.status)
  check('status=REVOKED', 'REVOKED', r.body.status)

  const rRetry = await api('POST', `/gyms/${gymId}/invitations/${inviteId}/revoke`, ownerToken)
  check('revoke already-revoked → 409', 409, rRetry.status)

  // Owner of gymId isn't a member of otherGymId, so requireGymWriteAccess
  // gates first → 403 (not 404). This is the right shape: callers shouldn't
  // be able to probe other gyms' invitation IDs.
  const rWrongGym = await api('POST', `/gyms/${otherGymId}/invitations/${inviteId}/revoke`, ownerToken)
  check('revoke from wrong-gym path → 403', 403, rWrongGym.status)
}

async function testInviteeFlow() {
  console.log('\n=== Invitee accept/decline ===')
  // First invite (createdInviteIds[0]) targeted not-yet-user (different email)
  // Second invite (createdInviteIds[1]) targeted inviteeId (existing).
  const inviteForExisting = createdInviteIds[1]

  // /users/me/invitations matches by userId
  const rList = await api('GET', '/users/me/invitations', inviteeToken)
  check('invitee sees own pending invitations', 200, rList.status)
  const list = rList.body as unknown as { id: string }[]
  check('list contains the invite', true, list.some((i) => i.id === inviteForExisting))

  // Stranger doesn't see it
  const rStranger = await api('GET', '/users/me/invitations', strangerToken)
  const strangerList = rStranger.body as unknown as { id: string }[]
  check('stranger sees no invites', 0, strangerList.length)

  // Stranger can't accept
  const rStrangerAccept = await api('POST', `/invitations/${inviteForExisting}/accept`, strangerToken)
  check('stranger accept → 403', 403, rStrangerAccept.status)

  // Invitee accepts
  const rAccept = await api('POST', `/invitations/${inviteForExisting}/accept`, inviteeToken)
  check('invitee accept → 200', 200, rAccept.status)
  check('status=APPROVED', 'APPROVED', rAccept.body.status)

  // UserGym row exists with correct role (COACH from invite #2)
  const membership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId: inviteeId, gymId } },
  })
  check('UserGym created with role=COACH', 'COACH', membership?.role)

  // Idempotent re-accept on already-approved → 409
  const rAcceptAgain = await api('POST', `/invitations/${inviteForExisting}/accept`, inviteeToken)
  check('accept already-approved → 409', 409, rAcceptAgain.status)
}

async function testEmailOnlyAccept() {
  console.log('\n=== Email-only ownership accept ===')
  // Create a fresh invite for not-yet-user email, then have someone with that
  // email (but no userId on invite) sign in and accept.
  const ts2 = Date.now()
  const newEmail = `email-only-${ts2}@test.com`
  const newUser = await prisma.user.create({ data: { email: newEmail } })
  const newToken = signTokenPair(newUser.id, 'MEMBER').accessToken

  // Invite by email AFTER user exists, so userId resolves on creation. To
  // exercise the email-only branch we have to create the invite then null its
  // userId (simulating "invitation predates signup").
  const created = await prisma.gymMembershipRequest.create({
    data: {
      gymId,
      direction: 'STAFF_INVITED',
      email: newEmail.toLowerCase(),
      userId: null,
      roleToGrant: 'MEMBER',
      invitedById: ownerId,
    },
  })
  createdInviteIds.push(created.id)

  const rList = await api('GET', '/users/me/invitations', newToken)
  const list = rList.body as unknown as { id: string }[]
  check('email-only invite shows up for matching user', true, list.some((i) => i.id === created.id))

  const rAccept = await api('POST', `/invitations/${created.id}/accept`, newToken)
  check('email-only accept → 200', 200, rAccept.status)
  check('userId attached after accept', newUser.id, rAccept.body.userId)

  await prisma.userGym.deleteMany({ where: { userId: newUser.id } })
  await prisma.refreshToken.deleteMany({ where: { userId: newUser.id } })
  await prisma.user.delete({ where: { id: newUser.id } })
}

async function testDecline() {
  console.log('\n=== Decline ===')
  // Re-issue an invite for the invitee since the prior one was accepted.
  await prisma.userGym.delete({ where: { userId_gymId: { userId: inviteeId, gymId } } })
  const reissue = await prisma.gymMembershipRequest.create({
    data: {
      gymId,
      direction: 'STAFF_INVITED',
      email: `inv-invitee-${TS}@test.com`,
      userId: inviteeId,
      roleToGrant: 'MEMBER',
      invitedById: ownerId,
    },
  })
  createdInviteIds.push(reissue.id)

  const rDecline = await api('POST', `/invitations/${reissue.id}/decline`, inviteeToken)
  check('decline → 200', 200, rDecline.status)
  check('status=DECLINED', 'DECLINED', rDecline.body.status)

  const reAccept = await api('POST', `/invitations/${reissue.id}/accept`, inviteeToken)
  check('accept declined invite → 409', 409, reAccept.status)
}

async function main() {
  try {
    await setup()
    await testAuthGuards()
    await testCreateInvitation()
    await testListInvitations()
    await testRevoke()
    await testInviteeFlow()
    await testEmailOnlyAccept()
    await testDecline()
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
