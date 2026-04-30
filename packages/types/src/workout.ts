import { z } from 'zod'
import {
  LoadUnitSchema,
  DistanceUnitSchema,
  RepsFieldSchema,
  TempoFieldSchema,
} from './result.js'

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

// Per-movement prescription. `movementId` is the only required field — every
// other field is optional and only filled in for the columns the programmer
// wants to track. `displayOrder` defaults to the position in the array on the
// API side when omitted.
export const WorkoutMovementPrescriptionSchema = z.object({
  movementId:   z.string().min(1),
  displayOrder: z.number().int().nonnegative().optional(),
  sets:         z.number().int().positive().optional(),
  reps:         RepsFieldSchema.optional(),
  load:         z.number().positive().optional(),
  loadUnit:     LoadUnitSchema.optional(),
  tempo:        TempoFieldSchema.optional(),
  distance:     z.number().positive().optional(),
  distanceUnit: DistanceUnitSchema.optional(),
  calories:     z.number().int().nonnegative().optional(),
  seconds:      z.number().int().nonnegative().optional(),
})

export type WorkoutMovementPrescriptionInput = z.infer<typeof WorkoutMovementPrescriptionSchema>

export const CreateWorkoutSchema = z
  .object({
    programId: z.string().optional(),
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    type: WorkoutTypeSchema,
    scheduledAt: z.string().datetime(),
    dayOrder: z.number().int().min(0).optional(),
    // Legacy bare-id list — still accepted for backward compatibility; routes
    // that take this shape upcast each id into a prescription with all other
    // fields null. Prefer `movements` for new clients.
    movementIds: z.array(z.string()).optional(),
    movements: z.array(WorkoutMovementPrescriptionSchema).optional(),
    namedWorkoutId: z.string().optional(),
    // Metcon time cap (seconds). Optional even on Metcon types.
    timeCapSeconds: z.number().int().positive().optional(),
    // AMRAP-only flag controlling whether the result form surfaces a `rounds`
    // input. Default false.
    tracksRounds: z.boolean().optional(),
  })
  .refine(
    (d) => !(d.movementIds !== undefined && d.movements !== undefined),
    { message: 'Pass either movementIds or movements, not both', path: ['movements'] },
  )

export const UpdateWorkoutSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: WorkoutTypeSchema.optional(),
    scheduledAt: z.string().datetime().optional(),
    dayOrder: z.number().int().min(0).optional(),
    movementIds: z.array(z.string()).optional(),
    movements: z.array(WorkoutMovementPrescriptionSchema).optional(),
    namedWorkoutId: z.string().nullable().optional(),
    timeCapSeconds: z.number().int().positive().nullable().optional(),
    tracksRounds: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' })
  .refine(
    (d) => !(d.movementIds !== undefined && d.movements !== undefined),
    { message: 'Pass either movementIds or movements, not both', path: ['movements'] },
  )

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
