import { z } from 'zod'

export const IdentifiedGenderSchema = z.enum(['FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'])
export type IdentifiedGender = z.infer<typeof IdentifiedGenderSchema>

// Backwards-compatible alias for the schema's earlier name.
const GenderSchema = IdentifiedGenderSchema

// Birthday accepted as YYYY-MM-DD; the API stores it as a date-only column.
const BirthdaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: 'birthday must be YYYY-MM-DD',
})

export const UpdateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    birthday: BirthdaySchema.nullable().optional(),
    identifiedGender: GenderSchema.nullable().optional(),
  })
  .strict()

export const CreateEmergencyContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    relationship: z.string().trim().max(80).optional(),
    phone: z.string().trim().min(1).max(40),
    email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
  })
  .strict()

export const UpdateEmergencyContactSchema = CreateEmergencyContactSchema.partial().strict()

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
export type CreateEmergencyContactInput = z.infer<typeof CreateEmergencyContactSchema>
export type UpdateEmergencyContactInput = z.infer<typeof UpdateEmergencyContactSchema>
