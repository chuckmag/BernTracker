import { z } from 'zod'

export const MovementStatusSchema = z.enum(['ACTIVE', 'PENDING', 'REJECTED'])
export const MovementCategorySchema = z.enum(['STRENGTH', 'MONOSTRUCTURAL', 'GYMNASTICS', 'SKILL', 'ENDURANCE', 'MACHINE'])
export const MovementPrTypeSchema = z.enum(['LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES', 'NONE'])

export const MovementSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: MovementStatusSchema,
  parentId: z.string().nullable(),
  // Authoritative reference URL — usually CrossFit /essentials/the-<slug>.
  sourceUrl: z.string().url().nullable().optional(),
  // Common abbreviations / alternate names for fuzzy matching.
  aliases: z.array(z.string()).optional().default([]),
  parent: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  variations: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
})

export const SuggestMovementSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
})

export const ReviewMovementSchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED']),
  category: MovementCategorySchema.optional(),
  prTypes: z.array(MovementPrTypeSchema).min(1).optional(),
})

export const UpdatePendingMovementSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
})

export const UpdateMovementSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  category: MovementCategorySchema.optional(),
  prTypes: z.array(MovementPrTypeSchema).min(1).optional(),
})

export type MovementStatus = z.infer<typeof MovementStatusSchema>
export type Movement = z.infer<typeof MovementSchema>
export type MovementCategory = z.infer<typeof MovementCategorySchema>
export type MovementPrType = z.infer<typeof MovementPrTypeSchema>
export type SuggestMovementInput = z.infer<typeof SuggestMovementSchema>
export type ReviewMovementInput = z.infer<typeof ReviewMovementSchema>
export type UpdatePendingMovementInput = z.infer<typeof UpdatePendingMovementSchema>
export type UpdateMovementInput = z.infer<typeof UpdateMovementSchema>
