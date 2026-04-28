import { z } from 'zod'

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'coverColor must be a 6-digit hex like #6366F1')

export const ProgramVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE'])

export const CreateProgramSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  coverColor: hexColor.optional(),
  visibility: ProgramVisibilitySchema.optional(),
})

export const UpdateProgramSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    startDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
    endDate: z.string().datetime({ offset: true }).or(z.string().date()).nullable().optional(),
    coverColor: hexColor.nullable().optional(),
    visibility: ProgramVisibilitySchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

// Slice 3 — invite a gym member onto a program. The caller supplies either
// the userId (autocomplete picker had it) or an email (the engineer typed it
// in). The server resolves email → userId via the gym's roster; only one of
// the two is required, but both are accepted (userId wins if both present).
export const InviteProgramMemberSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(['MEMBER', 'PROGRAMMER']).optional(),
  })
  .refine((data) => Boolean(data.userId || data.email), {
    message: 'Either userId or email is required',
  })

export type CreateProgramInput = z.infer<typeof CreateProgramSchema>
export type UpdateProgramInput = z.infer<typeof UpdateProgramSchema>
export type InviteProgramMemberInput = z.infer<typeof InviteProgramMemberSchema>
export type ProgramVisibility = z.infer<typeof ProgramVisibilitySchema>
