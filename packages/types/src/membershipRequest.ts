import { z } from 'zod'
import type { Role } from './auth.js'
import type { Invitation } from './invitation.js'

const RoleSchema = z.enum(['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'])

export const CreateInvitationSchema = z
  .object({
    email: z.string().trim().email().toLowerCase(),
    roleToGrant: RoleSchema.default('MEMBER'),
  })
  .strict()

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>

// ── Response shapes ──────────────────────────────────────────────────────────

export type MembershipRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'

// GymMembershipRequest as exposed by the API. Used by the inbox surfaces on
// both web and mobile (onboarding flow, settings memberships tab, gym staff
// admin panel).
export interface GymInvitation {
  id: string
  gymId: string
  direction: 'STAFF_INVITED' | 'USER_REQUESTED'
  status: MembershipRequestStatus
  email: string | null
  userId: string | null
  roleToGrant: Role
  invitedById: string | null
  decidedById: string | null
  decidedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  gym: { id: string; name: string; slug: string }
  invitedBy: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string } | null
}

// Discriminated union returned by GET /api/users/me/pending-invitations —
// merges pre-signup Invitation rows with existing-user GymMembershipRequests.
export type PendingInvitation =
  | { kind: 'invitation'; data: Invitation }
  | { kind: 'membershipRequest'; data: GymInvitation }

// Browse-public-gyms response (GET /api/gyms?search=…).
// `callerStatus` is the relationship between the requesting user and each
// gym, computed by the API so the client can pick the right CTA without
// re-deriving from memberships + outstanding requests.
export type GymBrowseStatus = 'NONE' | 'MEMBER' | 'REQUEST_PENDING'

export interface BrowseGym {
  id: string
  name: string
  slug: string
  timezone: string
  logoUrl: string | null
  memberCount: number
  callerStatus: GymBrowseStatus
}

// User-requested join (slice D2 of #120). Same shape as GymInvitation but with
// the invitedBy slot null and a `user` join populated for the staff-side list.
export interface GymJoinRequest {
  id: string
  gymId: string
  direction: 'USER_REQUESTED'
  status: MembershipRequestStatus
  email: string | null
  userId: string | null
  roleToGrant: Role
  invitedById: string | null
  decidedById: string | null
  decidedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  gym: { id: string; name: string; slug: string }
  user: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string } | null
}
