/**
 * Integration tests for the Invitation API (#204 / #202).
 *
 * Covers: unified gym invite routing, app-only invites, code lookup,
 * accept/decline/revoke, pending-invitations merged list, auth guards.
 *
 * Requires: API running, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/invitations.ts
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
let ownerId = '', ownerToken = ''
let coachId = '', coachToken = ''
let memberId = '', memberToken = ''
let strangerId = '', strangerToken = ''
// A user who exists but is not in the gym — used for existing-user routing test
let existingInviteeId = '', existingInviteeToken = ''

const createdInvitationIds: string[] = []
const createdMembershipRequestIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const gym = await prisma.gym.create({
    data: { name: `Invite Gym ${TS}`, slug: `invite-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const [owner, coach, member, stranger, existingInvitee] = await Promise.all([
    prisma.user.create({ data: { email: `invite-owner-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `invite-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `invite-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `invite-stranger-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `invite-existing-${TS}@test.com` } }),
  ])
  ownerId = owner.id
  coachId = coach.id
  memberId = member.id
  strangerId = stranger.id
  existingInviteeId = existingInvitee.id

  await prisma.userGym.createMany({
    data: [
      { userId: ownerId, gymId, role: 'OWNER' },
      { userId: coachId, gymId, role: 'COACH' },
      { userId: memberId, gymId, role: 'MEMBER' },
    ],
  })

  const [ownerTokens, coachTokens, memberTokens, strangerTokens, existingInviteeTokens] =
    await Promise.all([
      signTokenPair(ownerId, 'OWNER'),
      signTokenPair(coachId, 'MEMBER'),
      signTokenPair(memberId, 'MEMBER'),
      signTokenPair(strangerId, 'MEMBER'),
      signTokenPair(existingInviteeId, 'MEMBER'),
    ])
  ownerToken = ownerTokens.accessToken
  coachToken = coachTokens.accessToken
  memberToken = memberTokens.accessToken
  strangerToken = strangerTokens.accessToken
  existingInviteeToken = existingInviteeTokens.accessToken

  console.log('  fixtures created')
}

// ─── Gym invite: auth guards ──────────────────────────────────────────────────

async function testGymInviteAuthGuards() {
  console.log('\n=== Gym invite — auth guards ===')

  const r1 = await api('POST', `/gyms/${gymId}/invite`, undefined, {
    channel: 'EMAIL', email: `new-${TS}@test.com`,
  })
  check('401 without token', 401, r1.status)

  const r2 = await api('POST', `/gyms/${gymId}/invite`, memberToken, {
    channel: 'EMAIL', email: `new-${TS}@test.com`,
  })
  check('403 for MEMBER role', 403, r2.status)

  const r3 = await api('POST', `/gyms/${gymId}/invite`, strangerToken, {
    channel: 'EMAIL', email: `new-${TS}@test.com`,
  })
  check('403 for non-member', 403, r3.status)
}

// ─── Gym invite: new user → Invitation ────────────────────────────────────────

async function testGymInviteNewUserEmail() {
  console.log('\n=== Gym invite — new user, EMAIL channel ===')

  const newEmail = `brand-new-${TS}@test.com`
  const r = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: newEmail, roleToGrant: 'MEMBER',
  })
  check('201 status', 201, r.status)
  check('kind = invitation', 'invitation', (r.body as any).kind)
  const data = (r.body as any).data
  check('code is 6 chars', 6, data?.code?.length)
  check('channel EMAIL', 'EMAIL', data?.channel)
  check('email matches', newEmail, data?.email)
  check('gymId set', gymId, data?.gymId)
  check('status PENDING', 'PENDING', data?.status)
  if (data?.id) createdInvitationIds.push(data.id)

  // Duplicate → 409
  const dup = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: newEmail,
  })
  check('409 on duplicate pending invite', 409, dup.status)
}

async function testGymInviteNewUserSms() {
  console.log('\n=== Gym invite — new user, SMS channel ===')

  const r = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'SMS', phone: '+15551230001',
  })
  check('201 status', 201, r.status)
  check('kind = invitation', 'invitation', (r.body as any).kind)
  const data = (r.body as any).data
  check('channel SMS', 'SMS', data?.channel)
  check('phone set', '+15551230001', data?.phone)
  if (data?.id) createdInvitationIds.push(data.id)

  // Invalid phone
  const bad = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'SMS', phone: '5551230001',
  })
  check('400 for non-E164 phone', 400, bad.status)
}

// ─── Gym invite: existing user → GymMembershipRequest ────────────────────────

async function testGymInviteExistingUser() {
  console.log('\n=== Gym invite — existing user, EMAIL channel ===')

  const r = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: `invite-existing-${TS}@test.com`,
  })
  check('201 status', 201, r.status)
  check('kind = membershipRequest', 'membershipRequest', (r.body as any).kind)
  const data = (r.body as any).data
  check('has direction field', 'STAFF_INVITED', data?.direction)
  check('userId resolved', existingInviteeId, data?.userId)
  if (data?.id) createdMembershipRequestIds.push(data.id)

  // Already a member
  const r2 = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: `invite-owner-${TS}@test.com`,
  })
  check('409 for already-member', 409, r2.status)
}

// ─── App-only invite ──────────────────────────────────────────────────────────

async function testAppOnlyInvite() {
  console.log('\n=== App-only invite ===')

  const appEmail = `app-invite-${TS}@test.com`
  const r = await api('POST', '/invitations', ownerToken, {
    channel: 'EMAIL', email: appEmail,
  })
  check('201 status', 201, r.status)
  check('gymId is null', 'null', String((r.body as any).gymId))
  check('code is 6 chars', 6, (r.body as any).code?.length)
  if ((r.body as any).id) createdInvitationIds.push((r.body as any).id)

  // Inviting an existing user
  const r2 = await api('POST', '/invitations', ownerToken, {
    channel: 'EMAIL', email: `invite-existing-${TS}@test.com`,
  })
  check('409 for existing account email', 409, r2.status)

  // Unauthenticated
  const r3 = await api('POST', '/invitations', undefined, {
    channel: 'EMAIL', email: `no-auth-${TS}@test.com`,
  })
  check('401 without auth', 401, r3.status)
}

// ─── Code lookup ──────────────────────────────────────────────────────────────

async function testCodeLookup() {
  console.log('\n=== Code lookup ===')

  // Create a fresh invite to get a code
  const created = await api('POST', '/invitations', ownerToken, {
    channel: 'EMAIL', email: `lookup-test-${TS}@test.com`,
  })
  const code: string = (created.body as any).code
  if ((created.body as any).id) createdInvitationIds.push((created.body as any).id)

  const r = await api('GET', `/invitations/code/${code}`)
  check('200 public lookup', 200, r.status)
  check('returns code', code, (r.body as any).code)
  check('no email in response (privacy)', undefined, (r.body as any).email)

  const r2 = await api('GET', '/invitations/code/XXXXXX')
  check('404 for unknown code', 404, r2.status)
}

// ─── Accept / decline ─────────────────────────────────────────────────────────

async function testAcceptDecline() {
  console.log('\n=== Accept (gym context) ===')

  // Send the invite BEFORE the user exists so backend creates an Invitation (not GymMembershipRequest)
  const acceptEmail = `accept-test-${TS}@test.com`
  const created = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: acceptEmail,
  })
  const inviteId: string = (created.body as any).data?.id
  const inviteCode: string = (created.body as any).data?.code

  // Now create the user (simulating signup after receiving the invite)
  const invitee = await prisma.user.create({ data: { email: acceptEmail } })
  const { accessToken: inviteeToken } = await signTokenPair(invitee.id, 'MEMBER')

  // Wrong user can't accept
  const denied = await api('POST', `/invitations/code/${inviteCode}/accept`, strangerToken)
  check('403 wrong email', 403, denied.status)

  // Correct user accepts
  const accepted = await api('POST', `/invitations/code/${inviteCode}/accept`, inviteeToken)
  check('200 accept', 200, accepted.status)
  check('status ACCEPTED', 'ACCEPTED', (accepted.body as any).status)

  // UserGym was created
  const membership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId: invitee.id, gymId } },
  })
  check('UserGym created', true, !!membership)

  // GymMembershipRequest created as audit trail
  const auditRequest = await prisma.gymMembershipRequest.findFirst({
    where: { userId: invitee.id, gymId, direction: 'STAFF_INVITED', status: 'APPROVED' },
  })
  check('GymMembershipRequest audit trail created', true, !!auditRequest)

  // Can't accept again
  const again = await api('POST', `/invitations/code/${inviteCode}/accept`, inviteeToken)
  check('409 already accepted', 409, again.status)

  createdInvitationIds.push(inviteId)
  await prisma.user.delete({ where: { id: invitee.id } })

  console.log('\n=== Decline ===')
  const declineEmail = `decline-test-${TS}@test.com`
  // Same pattern: invite first (no account yet), then create the user
  const createdDecline = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: declineEmail,
  })
  const declineCode: string = (createdDecline.body as any).data?.code
  createdInvitationIds.push((createdDecline.body as any).data?.id)

  const declinee = await prisma.user.create({ data: { email: declineEmail } })
  const { accessToken: declineeToken } = await signTokenPair(declinee.id, 'MEMBER')

  const declined = await api('POST', `/invitations/code/${declineCode}/decline`, declineeToken)
  check('200 decline', 200, declined.status)
  check('status DECLINED', 'DECLINED', (declined.body as any).status)

  await prisma.user.delete({ where: { id: declinee.id } })
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

async function testRevoke() {
  console.log('\n=== Revoke ===')

  const created = await api('POST', `/gyms/${gymId}/invite`, ownerToken, {
    channel: 'EMAIL', email: `revoke-test-${TS}@test.com`,
  })
  const inviteId: string = (created.body as any).data?.id
  createdInvitationIds.push(inviteId)

  // Non-sender can't revoke
  const denied = await api('POST', `/invitations/${inviteId}/revoke`, strangerToken)
  check('403 non-sender revoke', 403, denied.status)

  // Owner (gym staff) can revoke
  const revoked = await api('POST', `/invitations/${inviteId}/revoke`, ownerToken)
  check('200 revoke', 200, revoked.status)
  check('status REVOKED', 'REVOKED', (revoked.body as any).status)

  // Can't revoke again
  const again = await api('POST', `/invitations/${inviteId}/revoke`, ownerToken)
  check('409 already revoked', 409, again.status)
}

// ─── Pending invitations merged list ─────────────────────────────────────────

async function testPendingInvitations() {
  console.log('\n=== Pending invitations merged list ===')

  const pendingEmail = `pending-test-${TS}@test.com`
  const pendingUser = await prisma.user.create({ data: { email: pendingEmail } })
  const { accessToken: pendingToken } = await signTokenPair(pendingUser.id, 'MEMBER')

  // Create a pre-signup Invitation for the email (before user existed — simulate via direct DB)
  const invite = await prisma.invitation.create({
    data: {
      code: `PEND${TS.toString().slice(-2)}`.slice(0, 6).toUpperCase().replace(/[01OI]/g, 'A'),
      channel: 'EMAIL',
      email: pendingEmail,
      gymId,
      roleToGrant: 'MEMBER',
      invitedById: ownerId,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  })
  createdInvitationIds.push(invite.id)

  const r = await api('GET', '/users/me/pending-invitations', pendingToken)
  check('200 merged list', 200, r.status)
  const items = r.body as any[]
  const kinds = items.map((i) => i.kind)
  check('contains invitation kind', true, kinds.includes('invitation'))

  // Unauthenticated
  const r2 = await api('GET', '/users/me/pending-invitations')
  check('401 without auth', 401, r2.status)

  await prisma.user.delete({ where: { id: pendingUser.id } })
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  if (createdInvitationIds.length) {
    await prisma.invitation.deleteMany({ where: { id: { in: createdInvitationIds } } })
  }
  await prisma.gymMembershipRequest.deleteMany({ where: { gymId } })
  await prisma.userGym.deleteMany({ where: { gymId } })
  await prisma.gym.delete({ where: { id: gymId } })
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          `invite-owner-${TS}@test.com`,
          `invite-coach-${TS}@test.com`,
          `invite-member-${TS}@test.com`,
          `invite-stranger-${TS}@test.com`,
          `invite-existing-${TS}@test.com`,
        ],
      },
    },
  })
  console.log('  done')
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await setup()
    await testGymInviteAuthGuards()
    await testGymInviteNewUserEmail()
    await testGymInviteNewUserSms()
    await testGymInviteExistingUser()
    await testAppOnlyInvite()
    await testCodeLookup()
    await testAcceptDecline()
    await testRevoke()
    await testPendingInvitations()
  } finally {
    await teardown()
    await prisma.$disconnect()
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
    if (fail > 0) process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
