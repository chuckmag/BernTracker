import { z } from 'zod'

export const MovementStatusSchema = z.enum(['ACTIVE', 'PENDING', 'REJECTED'])

export const MovementSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: MovementStatusSchema,
  parentId: z.string().nullable(),
  parent: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  variations: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
})

export const SuggestMovementSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
})

export const ReviewMovementSchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED']),
})

export const UpdatePendingMovementSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
})

export type MovementStatus = z.infer<typeof MovementStatusSchema>
export type Movement = z.infer<typeof MovementSchema>
export type SuggestMovementInput = z.infer<typeof SuggestMovementSchema>
export type ReviewMovementInput = z.infer<typeof ReviewMovementSchema>
export type UpdatePendingMovementInput = z.infer<typeof UpdatePendingMovementSchema>
