import { z } from 'zod'

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
