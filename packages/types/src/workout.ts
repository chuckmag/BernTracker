import { z } from 'zod'

export const WorkoutTypeSchema = z.enum(['STRENGTH', 'FOR_TIME', 'EMOM', 'CARDIO', 'AMRAP', 'METCON', 'WARMUP'])

export const CreateWorkoutSchema = z.object({
  programId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  type: WorkoutTypeSchema,
  scheduledAt: z.string().datetime(),
})

export const UpdateWorkoutSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: WorkoutTypeSchema.optional(),
    scheduledAt: z.string().datetime().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

export type CreateWorkoutInput = z.infer<typeof CreateWorkoutSchema>
export type UpdateWorkoutInput = z.infer<typeof UpdateWorkoutSchema>
