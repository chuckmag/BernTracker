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

export type WorkoutLevel = z.infer<typeof WorkoutLevelSchema>
export type WorkoutGender = z.infer<typeof WorkoutGenderSchema>

// Maps a user's self-identified gender to the leaderboard grouping enum.
// MALE/FEMALE pass through; everything else (NON_BINARY / PREFER_NOT_TO_SAY /
// null / unset) groups under OPEN. Shared across web and mobile so a single
// rule decides which leaderboard a result lands in.
export function deriveWorkoutGender(
  g: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | null | undefined,
): WorkoutGender {
  if (g === 'MALE' || g === 'FEMALE') return g
  return 'OPEN'
}

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
