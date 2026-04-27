import { z } from 'zod'

// AMRAP: scored by rounds + reps completed within the time cap
export const AmrapResultSchema = z.object({
  type: z.literal('AMRAP'),
  rounds: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
})

// For Time: scored by total seconds to completion
export const ForTimeResultSchema = z.object({
  type: z.literal('FOR_TIME'),
  seconds: z.number().int().positive(),
  cappedOut: z.boolean().default(false),
})

// Discriminated union — stored as JSON in Result.value
export const ResultValueSchema = z.discriminatedUnion('type', [
  AmrapResultSchema,
  ForTimeResultSchema,
])

export type AmrapResult = z.infer<typeof AmrapResultSchema>
export type ForTimeResult = z.infer<typeof ForTimeResultSchema>
export type ResultValue = z.infer<typeof ResultValueSchema>

export const WorkoutLevelSchema = z.enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED'])
export const WorkoutGenderSchema = z.enum(['MALE', 'FEMALE', 'OPEN'])

export const CreateResultSchema = z.object({
  level: WorkoutLevelSchema,
  workoutGender: WorkoutGenderSchema,
  value: ResultValueSchema,
  notes: z.string().optional(),
})

export type CreateResultInput = z.infer<typeof CreateResultSchema>

export const UpdateResultSchema = z.object({
  level: WorkoutLevelSchema.optional(),
  value: ResultValueSchema.optional(),
  notes: z.string().nullable().optional(),
})

export type UpdateResultInput = z.infer<typeof UpdateResultSchema>
