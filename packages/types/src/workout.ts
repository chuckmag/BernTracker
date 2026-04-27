import { z } from 'zod'

export const WorkoutTypeSchema = z.enum([
  // Strength
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
  // Conditioning (Metcon)
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
  // MonoStructural
  'CARDIO', 'RUNNING', 'ROWING', 'BIKING', 'SWIMMING', 'SKI_ERG', 'MIXED_MONO',
  // Skill Work
  'GYMNASTICS', 'WEIGHTLIFTING_TECHNIQUE',
  // Warmup / Recovery
  'WARMUP', 'MOBILITY', 'COOLDOWN',
])

export const WorkoutCategorySchema = z.enum(['GIRL_WOD', 'HERO_WOD', 'OPEN_WOD', 'GAMES_WOD', 'BENCHMARK'])

export const CreateWorkoutSchema = z.object({
  programId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  type: WorkoutTypeSchema,
  scheduledAt: z.string().datetime(),
  dayOrder: z.number().int().min(0).optional(),
  movementIds: z.array(z.string()).optional(),
  namedWorkoutId: z.string().optional(),
})

export const UpdateWorkoutSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: WorkoutTypeSchema.optional(),
    scheduledAt: z.string().datetime().optional(),
    dayOrder: z.number().int().min(0).optional(),
    movementIds: z.array(z.string()).optional(),
    namedWorkoutId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

export const CreateNamedWorkoutSchema = z.object({
  name: z.string().min(1),
  category: WorkoutCategorySchema,
  aliases: z.array(z.string()).optional(),
  template: z.object({
    type: WorkoutTypeSchema,
    description: z.string().min(1),
    movementIds: z.array(z.string()).optional(),
  }).optional(),
})

export const UpdateNamedWorkoutSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: WorkoutCategorySchema.optional(),
    aliases: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
    templateWorkoutId: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })

export type CreateWorkoutInput = z.infer<typeof CreateWorkoutSchema>
export type UpdateWorkoutInput = z.infer<typeof UpdateWorkoutSchema>
export type CreateNamedWorkoutInput = z.infer<typeof CreateNamedWorkoutSchema>
export type UpdateNamedWorkoutInput = z.infer<typeof UpdateNamedWorkoutSchema>
