import { z } from 'zod'

const RoleSchema = z.enum(['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'])

export const CreateInvitationSchema = z
  .object({
    email: z.string().trim().email().toLowerCase(),
    roleToGrant: RoleSchema.default('MEMBER'),
  })
  .strict()

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>
