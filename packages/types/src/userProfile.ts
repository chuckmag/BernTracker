import { z } from 'zod'
import { LoadUnitSchema, DistanceUnitSchema, type LoadUnit, type DistanceUnit } from './result.js'
import type { Role } from './auth.js'

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
    preferredLoadUnit: LoadUnitSchema.optional(),
    preferredDistanceUnit: DistanceUnitSchema.optional(),
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

// Response shapes returned by GET /api/users/me/profile and
// /api/users/me/emergency-contacts. Dates arrive over the wire as ISO strings.
export interface EmergencyContact {
  id: string
  userId: string
  name: string
  relationship: string | null
  phone: string
  email: string | null
  createdAt: string
  updatedAt: string
}

export interface UserProfile {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  birthday: string | null
  identifiedGender: IdentifiedGender | null
  avatarUrl: string | null
  onboardedAt: string | null
  role: Role
  preferredLoadUnit: LoadUnit
  preferredDistanceUnit: DistanceUnit
  emergencyContacts: EmergencyContact[]
}
