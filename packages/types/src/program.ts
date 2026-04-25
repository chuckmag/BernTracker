import { z } from 'zod'

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'coverColor must be a 6-digit hex like #6366F1')

export const CreateProgramSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().date()),
  endDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  coverColor: hexColor.optional(),
})

export const UpdateProgramSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    startDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
    endDate: z.string().datetime({ offset: true }).or(z.string().date()).nullable().optional(),
    coverColor: hexColor.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

export type CreateProgramInput = z.infer<typeof CreateProgramSchema>
export type UpdateProgramInput = z.infer<typeof UpdateProgramSchema>
