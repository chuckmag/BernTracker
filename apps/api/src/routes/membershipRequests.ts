import { Router, type Request, type Response } from 'express'
import type { Role } from '@wodalytics/db'
import { CreateInvitationSchema } from '@wodalytics/types'
import { requireAuth } from '../middleware/auth.js'
import { validateGymExists, requireGymWriteAccess } from '../middleware/gym.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { findUserProfileById } from '../db/userProfileDbManager.js'
import {
  findStaffInvitationsByGymId,
  findPendingStaffInvitationsForUser,
  findInvitationById,
  findExistingPendingInvitation,
  createStaffInvitation,
  setInvitationStatus,
  findUserByEmail,
  acceptInvitationAndCreateMembership,
  findExistingPendingJoinRequest,
  createJoinRequest,
  findPendingJoinRequestsByGymId,
  findPendingJoinRequestsForUser,
  approveJoinRequestAndCreateMembership,
} from '../db/gymMembershipRequestDbManager.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('invitations')

// Roles each inviter is allowed to grant. OWNER can grant anything; PROGRAMMER
// can grant peers + below; COACH can grant MEMBER only. MEMBER cannot invite at
// all (blocked one layer up by requireGymWriteAccess).
const GRANTABLE_BY: Record<Role, Role[]> = {
  OWNER: ['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'],
  PROGRAMMER: ['PROGRAMMER', 'COACH', 'MEMBER'],
  COACH: ['MEMBER'],
  MEMBER: [],
}

const router = Router()

router.get('/gyms/:gymId/invitations', requireAuth, validateGymExists, requireGymWriteAccess, listInvitationsForGym)
router.post('/gyms/:gymId/invitations', requireAuth, validateGymExists, requireGymWriteAccess, createInvitationForGym)
router.post('/gyms/:gymId/invitations/:id/revoke', requireAuth, validateGymExists, requireGymWriteAccess, revokeInvitation)

router.get('/users/me/invitations', requireAuth, listMyPendingInvitations)
router.post('/invitations/:id/accept', requireAuth, acceptInvitation)
router.post('/invitations/:id/decline', requireAuth, declineInvitation)

// ─── Join requests (slice D2) ────────────────────────────────────────────────

// User-side
router.post('/gyms/:gymId/join-request', requireAuth, validateGymExists, createMyJoinRequest)
router.delete('/gyms/:gymId/join-request', requireAuth, validateGymExists, cancelMyJoinRequest)
router.get('/users/me/join-requests', requireAuth, listMyJoinRequests)

// Staff-side
router.get('/gyms/:gymId/join-requests', requireAuth, validateGymExists, requireGymWriteAccess, listJoinRequestsForGym)
router.post('/gyms/:gymId/join-requests/:id/approve', requireAuth, validateGymExists, requireGymWriteAccess, approveJoinRequest)
router.post('/gyms/:gymId/join-requests/:id/decline', requireAuth, validateGymExists, requireGymWriteAccess, declineJoinRequest)

export default router

async function listInvitationsForGym(req: Request, res: Response) {
  const invitations = await findStaffInvitationsByGymId(req.params.gymId as string)
  res.json(invitations)
}

async function createInvitationForGym(req: Request, res: Response) {
  const parsed = CreateInvitationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  const { email, roleToGrant } = parsed.data
  const gymId = req.params.gymId as string
  const inviterId = req.user!.id

  const inviterMembership = await findGymMembershipByUserAndGym(inviterId, gymId)
  if (!inviterMembership) {
    // requireGymWriteAccess should have caught this, but defensive.
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (!GRANTABLE_BY[inviterMembership.role].includes(roleToGrant)) {
    log.warning(req, `createInvitationForGym: ${inviterMembership.role} cannot grant ${roleToGrant} — userId=${inviterId} gym=${gymId}`)
    res.status(403).json({ error: `Your role cannot grant ${roleToGrant}.` })
    return
  }

  // Reject if already a member of the gym (case-insensitive email match).
  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    const existingMembership = await findGymMembershipByUserAndGym(existingUser.id, gymId)
    if (existingMembership) {
      res.status(409).json({ error: 'That user is already a member of this gym.' })
      return
    }
  }

  // Reject duplicate pending invitations for the same email + gym.
  const existingPending = await findExistingPendingInvitation(gymId, email)
  if (existingPending) {
    res.status(409).json({ error: 'An invitation is already pending for that email.' })
    return
  }

  const invitation = await createStaffInvitation({
    gymId,
    email,
    roleToGrant,
    invitedById: inviterId,
    resolvedUserId: existingUser?.id ?? null,
  })
  res.status(201).json(invitation)
}

async function revokeInvitation(req: Request, res: Response) {
  const id = req.params.id as string
  const invitation = await findInvitationById(id)
  if (!invitation || invitation.gymId !== (req.params.gymId as string)) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING') {
    res.status(409).json({ error: `Invitation is already ${invitation.status.toLowerCase()}.` })
    return
  }
  const updated = await setInvitationStatus({
    id,
    status: 'REVOKED',
    decidedById: req.user!.id,
  })
  res.json(updated)
}

async function listMyPendingInvitations(req: Request, res: Response) {
  const profile = await findUserProfileById(req.user!.id)
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const invitations = await findPendingStaffInvitationsForUser({
    userId: profile.id,
    email: profile.email,
  })
  res.json(invitations)
}

async function acceptInvitation(req: Request, res: Response) {
  const userId = req.user!.id
  const id = req.params.id as string
  const invitation = await findInvitationById(id)
  if (!invitation || invitation.direction !== 'STAFF_INVITED') {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING') {
    res.status(409).json({ error: `Invitation is already ${invitation.status.toLowerCase()}.` })
    return
  }
  // Ownership check: invitation.userId matches caller, OR invitation.email
  // matches the caller's email (case-insensitive) when not yet linked.
  const profile = await findUserProfileById(userId)
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const callerOwnsByUserId = invitation.userId === userId
  const callerOwnsByEmail =
    invitation.userId === null &&
    invitation.email !== null &&
    invitation.email.toLowerCase() === profile.email.toLowerCase()
  if (!callerOwnsByUserId && !callerOwnsByEmail) {
    log.warning(req, `acceptInvitation: caller does not own invitation — userId=${userId} inviteId=${id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const result = await acceptInvitationAndCreateMembership({
    invitationId: id,
    userId,
    gymId: invitation.gymId,
    roleToGrant: invitation.roleToGrant,
  })
  res.json(result)
}

async function declineInvitation(req: Request, res: Response) {
  const userId = req.user!.id
  const id = req.params.id as string
  const invitation = await findInvitationById(id)
  if (!invitation || invitation.direction !== 'STAFF_INVITED') {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING') {
    res.status(409).json({ error: `Invitation is already ${invitation.status.toLowerCase()}.` })
    return
  }
  const profile = await findUserProfileById(userId)
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const callerOwnsByUserId = invitation.userId === userId
  const callerOwnsByEmail =
    invitation.userId === null &&
    invitation.email !== null &&
    invitation.email.toLowerCase() === profile.email.toLowerCase()
  if (!callerOwnsByUserId && !callerOwnsByEmail) {
    log.warning(req, `declineInvitation: caller does not own invitation — userId=${userId} inviteId=${id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const updated = await setInvitationStatus({
    id,
    status: 'DECLINED',
    decidedById: userId,
    attachUserId: userId,
  })
  res.json(updated)
}

// ─── Join request handlers ───────────────────────────────────────────────────

async function createMyJoinRequest(req: Request, res: Response) {
  const userId = req.user!.id
  const gymId = req.params.gymId as string

  // Already a member? 409.
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (membership) {
    res.status(409).json({ error: 'You are already a member of this gym.' })
    return
  }
  // Already requested? 409.
  const existing = await findExistingPendingJoinRequest(gymId, userId)
  if (existing) {
    res.status(409).json({ error: 'You already have a pending request to join this gym.' })
    return
  }

  const created = await createJoinRequest({ gymId, userId })
  res.status(201).json(created)
}

async function cancelMyJoinRequest(req: Request, res: Response) {
  const userId = req.user!.id
  const gymId = req.params.gymId as string
  const existing = await findExistingPendingJoinRequest(gymId, userId)
  if (!existing) {
    res.status(404).json({ error: 'No pending request found' })
    return
  }
  const updated = await setInvitationStatus({
    id: existing.id,
    status: 'REVOKED',
    decidedById: userId,
  })
  res.json(updated)
}

async function listMyJoinRequests(req: Request, res: Response) {
  const list = await findPendingJoinRequestsForUser(req.user!.id)
  res.json(list)
}

async function listJoinRequestsForGym(req: Request, res: Response) {
  const list = await findPendingJoinRequestsByGymId(req.params.gymId as string)
  res.json(list)
}

async function approveJoinRequest(req: Request, res: Response) {
  const id = req.params.id as string
  const gymId = req.params.gymId as string
  const request = await findInvitationById(id)
  if (!request || request.gymId !== gymId || request.direction !== 'USER_REQUESTED') {
    res.status(404).json({ error: 'Join request not found' })
    return
  }
  if (request.status !== 'PENDING') {
    res.status(409).json({ error: `Request is already ${request.status.toLowerCase()}.` })
    return
  }
  if (!request.userId) {
    // Defensive — schema migration in slice A doesn't enforce userId !== null
    // for USER_REQUESTED, so guard at the API.
    log.warning(req, `approveJoinRequest: request has null userId — id=${id}`)
    res.status(500).json({ error: 'Malformed request — missing userId' })
    return
  }
  const result = await approveJoinRequestAndCreateMembership({
    requestId: id,
    userId: request.userId,
    gymId: request.gymId,
    roleToGrant: request.roleToGrant,
    decidedById: req.user!.id,
  })
  res.json(result)
}

async function declineJoinRequest(req: Request, res: Response) {
  const id = req.params.id as string
  const gymId = req.params.gymId as string
  const request = await findInvitationById(id)
  if (!request || request.gymId !== gymId || request.direction !== 'USER_REQUESTED') {
    res.status(404).json({ error: 'Join request not found' })
    return
  }
  if (request.status !== 'PENDING') {
    res.status(409).json({ error: `Request is already ${request.status.toLowerCase()}.` })
    return
  }
  const updated = await setInvitationStatus({
    id,
    status: 'DECLINED',
    decidedById: req.user!.id,
  })
  res.json(updated)
}
