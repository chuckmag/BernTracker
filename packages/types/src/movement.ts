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

export type MovementStatus = z.infer<typeof MovementStatusSchema>
export type Movement = z.infer<typeof MovementSchema>
