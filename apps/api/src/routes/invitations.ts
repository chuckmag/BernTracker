import { Router, type Request, type Response } from 'express'
import type { Role } from '@wodalytics/db'
import { CreateGymInviteSchema, CreateAppInviteSchema } from '@wodalytics/types'
import { requireAuth } from '../middleware/auth.js'
import { validateGymExists, requireGymWriteAccess } from '../middleware/gym.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { findUserProfileById } from '../db/userProfileDbManager.js'
import {
  findExistingPendingInvitation,
  createStaffInvitation,
  findUserByEmail,
  findPendingStaffInvitationsForUser,
} from '../db/gymMembershipRequestDbManager.js'
import {
  createInvitation,
  findInvitationByCode,
  findInvitationById,
  findPendingInvitationsByEmail,
  findExistingPendingCodeInvite,
  setInvitationStatus,
  acceptPreSignupInvitationAndJoinGym,
} from '../db/invitationDbManager.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('invitations')

// Roles each inviter is allowed to grant — mirrors the rule in membershipRequests.ts
const GRANTABLE_BY: Record<Role, Role[]> = {
  OWNER: ['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'],
  PROGRAMMER: ['PROGRAMMER', 'COACH', 'MEMBER'],
  COACH: ['MEMBER'],
  MEMBER: [],
}

const router = Router()

// ─── Gym invite (unified — backend routes by whether invitee has an account) ──
router.post('/gyms/:gymId/invite', requireAuth, validateGymExists, requireGymWriteAccess, createGymInvite)

// ─── App-only invite (no gym context) ─────────────────────────────────────────
router.post('/invitations', requireAuth, createAppOnlyInvite)

// ─── Public code lookup (used by the /join landing page) ──────────────────────
// Namespaced to /invitations/code/* to avoid conflict with the existing
// /invitations/:id (UUID) routes in membershipRequests.ts.
router.get('/invitations/code/:code', lookupInvitationByCode)

// ─── Invitee actions ──────────────────────────────────────────────────────────
router.get('/users/me/pending-invitations', requireAuth, listMyPendingInvitations)
router.post('/invitations/code/:code/accept', requireAuth, acceptCodeInvitation)
router.post('/invitations/code/:code/decline', requireAuth, declineCodeInvitation)

// ─── Sender revoke ────────────────────────────────────────────────────────────
router.post('/invitations/:id/revoke', requireAuth, revokeInvitation)

export default router

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function createGymInvite(req: Request, res: Response) {
  const parsed = CreateGymInviteSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const gymId = req.params.gymId as string
  const inviterId = req.user!.id
  const { roleToGrant } = parsed.data
  const email = parsed.data.channel === 'EMAIL' ? parsed.data.email : undefined
  const phone = parsed.data.channel === 'SMS' ? parsed.data.phone : undefined

  const inviterMembership = await findGymMembershipByUserAndGym(inviterId, gymId)
  if (!inviterMembership) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (!GRANTABLE_BY[inviterMembership.role].includes(roleToGrant)) {
    log.warning(req, `createGymInvite: ${inviterMembership.role} cannot grant ${roleToGrant} — userId=${inviterId} gym=${gymId}`)
    res.status(403).json({ error: `Your role cannot grant ${roleToGrant}.` })
    return
  }

  if (email) {
    const existingUser = await findUserByEmail(email)

    if (existingUser) {
      // Invitee already has an account — use the existing GymMembershipRequest flow
      if (existingUser.id === inviterId) {
        res.status(409).json({ error: 'You cannot invite yourself.' })
        return
      }
      const existingMembership = await findGymMembershipByUserAndGym(existingUser.id, gymId)
      if (existingMembership) {
        res.status(409).json({ error: 'That user is already a member of this gym.' })
        return
      }
      const existingPending = await findExistingPendingInvitation(gymId, email)
      if (existingPending) {
        res.status(409).json({ error: 'An invitation is already pending for that email.' })
        return
      }
      const membershipRequest = await createStaffInvitation({
        gymId,
        email,
        roleToGrant,
        invitedById: inviterId,
        resolvedUserId: existingUser.id,
      })
      res.status(201).json({ kind: 'membershipRequest', data: membershipRequest })
      return
    }

    // No account yet — check for duplicate pending Invitation
    const existingInvite = await findExistingPendingCodeInvite({ gymId, email })
    if (existingInvite) {
      res.status(409).json({ error: 'An invitation is already pending for that email.' })
      return
    }
  } else if (phone) {
    // SMS — no user lookup possible, only dedupe by phone
    const existingInvite = await findExistingPendingCodeInvite({ gymId, phone })
    if (existingInvite) {
      res.status(409).json({ error: 'An invitation is already pending for that phone number.' })
      return
    }
  }

  // No existing account — create a pre-signup Invitation
  const invitation = await createInvitation({
    channel: parsed.data.channel,
    email,
    phone,
    gymId,
    roleToGrant,
    invitedById: inviterId,
  })
  res.status(201).json({ kind: 'invitation', data: invitation })
}

async function createAppOnlyInvite(req: Request, res: Response) {
  const parsed = CreateAppInviteSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const inviterId = req.user!.id
  const email = parsed.data.channel === 'EMAIL' ? parsed.data.email : undefined
  const phone = parsed.data.channel === 'SMS' ? parsed.data.phone : undefined

  if (email) {
    // Prevent inviting someone who already has an account (no-gym context)
    const existing = await findUserByEmail(email)
    if (existing) {
      if (existing.id === inviterId) {
        res.status(409).json({ error: 'You cannot invite yourself.' })
        return
      }
      res.status(409).json({ error: 'That email already belongs to a WODalytics account.' })
      return
    }
    const existingInvite = await findExistingPendingCodeInvite({ email })
    if (existingInvite) {
      res.status(409).json({ error: 'An invitation is already pending for that email.' })
      return
    }
  } else if (phone) {
    const existingInvite = await findExistingPendingCodeInvite({ phone })
    if (existingInvite) {
      res.status(409).json({ error: 'An invitation is already pending for that phone number.' })
      return
    }
  }

  const invitation = await createInvitation({
    channel: parsed.data.channel,
    email,
    phone,
    invitedById: inviterId,
    roleToGrant: 'MEMBER',
  })
  res.status(201).json(invitation)
}

async function lookupInvitationByCode(req: Request, res: Response) {
  const invitation = await findInvitationByCode(req.params.code as string)
  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invitation is no longer valid', status: invitation.status })
    return
  }
  // Return safe subset — no phone/email leak to unauthenticated callers
  res.json({
    code: invitation.code,
    channel: invitation.channel,
    gymId: invitation.gymId,
    gym: invitation.gym,
    invitedBy: invitation.invitedBy,
    roleToGrant: invitation.roleToGrant,
    expiresAt: invitation.expiresAt,
  })
}

async function listMyPendingInvitations(req: Request, res: Response) {
  const profile = await findUserProfileById(req.user!.id)
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const [codeInvitations, membershipRequests] = await Promise.all([
    findPendingInvitationsByEmail(profile.email),
    findPendingStaffInvitationsForUser({ userId: profile.id, email: profile.email }),
  ])

  const merged = [
    ...codeInvitations.map((data) => ({ kind: 'invitation' as const, data })),
    ...membershipRequests.map((data) => ({ kind: 'membershipRequest' as const, data })),
  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime())

  res.json(merged)
}

async function acceptCodeInvitation(req: Request, res: Response) {
  const userId = req.user!.id
  const code = req.params.code as string

  const invitation = await findInvitationByCode(code)
  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING') {
    res.status(409).json({ error: `Invitation is already ${invitation.status.toLowerCase()}.` })
    return
  }
  if (invitation.expiresAt < new Date()) {
    res.status(410).json({ error: 'Invitation has expired.' })
    return
  }

  // Ownership check: email must match the caller's account email
  const profile = await findUserProfileById(userId)
  if (!profile) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  if (invitation.email && invitation.email.toLowerCase() !== profile.email.toLowerCase()) {
    log.warning(req, `acceptCodeInvitation: email mismatch — userId=${userId} code=${code}`)
    res.status(403).json({ error: 'This invitation was not sent to your email address.' })
    return
  }

  if (invitation.gymId) {
    const result = await acceptPreSignupInvitationAndJoinGym({
      invitationId: invitation.id,
      userId,
      gymId: invitation.gymId,
      roleToGrant: invitation.roleToGrant,
      invitedById: invitation.invitedById,
    })
    res.json(result)
  } else {
    // App-only invite — just mark accepted
    const result = await setInvitationStatus({ id: invitation.id, status: 'ACCEPTED', acceptedById: userId })
    res.json(result)
  }
}

async function declineCodeInvitation(req: Request, res: Response) {
  const userId = req.user!.id
  const code = req.params.code as string

  const invitation = await findInvitationByCode(code)
  if (!invitation) {
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
  if (invitation.email && invitation.email.toLowerCase() !== profile.email.toLowerCase()) {
    log.warning(req, `declineCodeInvitation: email mismatch — userId=${userId} code=${code}`)
    res.status(403).json({ error: 'This invitation was not sent to your email address.' })
    return
  }

  const result = await setInvitationStatus({ id: invitation.id, status: 'DECLINED', acceptedById: userId })
  res.json(result)
}

async function revokeInvitation(req: Request, res: Response) {
  const userId = req.user!.id
  const id = req.params.id as string

  const invitation = await findInvitationById(id)
  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found' })
    return
  }
  if (invitation.status !== 'PENDING') {
    res.status(409).json({ error: `Invitation is already ${invitation.status.toLowerCase()}.` })
    return
  }

  // Only the sender or a gym staff member (if gym-context) may revoke
  const isSender = invitation.invitedById === userId
  let isGymStaff = false
  if (invitation.gymId) {
    const membership = await findGymMembershipByUserAndGym(userId, invitation.gymId)
    isGymStaff = !!membership && membership.role !== 'MEMBER'
  }
  if (!isSender && !isGymStaff) {
    log.warning(req, `revokeInvitation: caller not authorised — userId=${userId} inviteId=${id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const result = await setInvitationStatus({ id, status: 'REVOKED' })
  res.json(result)
}
