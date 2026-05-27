import { z } from 'zod'
import type { Role } from './auth.js'

const RoleSchema = z.enum(['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'])

// E.164 format: +country-code then digits, 2–15 total chars after the +
const PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be E.164 format (e.g. +15551234567)')

export const CreateGymInviteSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('EMAIL'),
    email: z.string().trim().email().transform((e) => e.toLowerCase()),
    roleToGrant: RoleSchema.default('MEMBER'),
  }),
  z.object({
    channel: z.literal('SMS'),
    phone: PhoneSchema,
    roleToGrant: RoleSchema.default('MEMBER'),
  }),
])

export type CreateGymInviteInput = z.infer<typeof CreateGymInviteSchema>

export const CreateAppInviteSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('EMAIL'),
    email: z.string().trim().email().transform((e) => e.toLowerCase()),
  }),
  z.object({
    channel: z.literal('SMS'),
    phone: PhoneSchema,
  }),
])

export type CreateAppInviteInput = z.infer<typeof CreateAppInviteSchema>

// ── Response shapes ──────────────────────────────────────────────────────────

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'
export type InvitationChannel = 'EMAIL' | 'SMS'

// Pre-signup invitation delivered by email/SMS code.
export interface Invitation {
  id: string
  code: string
  channel: InvitationChannel
  email: string | null
  phone: string | null
  gymId: string | null
  roleToGrant: Role
  invitedById: string
  status: InvitationStatus
  expiresAt: string
  acceptedById: string | null
  createdAt: string
  updatedAt: string
  gym: { id: string; name: string; slug: string } | null
  invitedBy: { id: string; firstName: string | null; lastName: string | null }
}

// Public lookup returned by GET /invitations/code/:code — safe subset, no contact info.
export interface InvitationLookup {
  code: string
  channel: InvitationChannel
  gymId: string | null
  gym: { id: string; name: string; slug: string } | null
  invitedBy: { id: string; firstName: string | null; lastName: string | null }
  roleToGrant: Role
  expiresAt: string
}
