import { z } from 'zod'

// ─── Units (mirror Prisma enums) ──────────────────────────────────────────────

export const LoadUnitSchema = z.enum(['LB', 'KG'])
export const DistanceUnitSchema = z.enum(['M', 'KM', 'MI', 'FT', 'YD'])

export type LoadUnit = z.infer<typeof LoadUnitSchema>
export type DistanceUnit = z.infer<typeof DistanceUnitSchema>

// ─── Field-level shapes ───────────────────────────────────────────────────────

// Reps as a string. Standard "10" or cluster notation "1.1.1" (rest between
// chunks). Validated as one or more positive integers separated by dots.
export const RepsFieldSchema = z
  .string()
  .regex(/^\d+(\.\d+)*$/, 'Reps must be a positive integer or cluster notation like "1.1.1"')

// Tempo as four positions separated by dots. Each position is a digit or "x"
// (denotes "as fast as possible / no prescription"). Examples: "3.1.1.0",
// "x.0.x.0".
export const TempoFieldSchema = z
  .string()
  .regex(/^[\dxX](\.[\dxX]){3}$/, 'Tempo must be four dot-separated positions, e.g. "3.1.1.0"')

// One row in a movement's set table. Every field is optional — only the
// columns the programmer prescribed (or the member added) carry values.
export const SetEntrySchema = z.object({
  reps:     RepsFieldSchema.optional(),
  load:     z.number().positive().optional(),
  tempo:    TempoFieldSchema.optional(),
  distance: z.number().positive().optional(),
  calories: z.number().int().nonnegative().optional(),
  seconds:  z.number().int().nonnegative().optional(),
})

// Per-movement result block. `workoutMovementId` ties this back to the
// programmed movement; unit fields are locked at the movement level (no
// per-set unit switching).
export const MovementResultSchema = z.object({
  workoutMovementId: z.string().min(1),
  loadUnit:          LoadUnitSchema.optional(),
  distanceUnit:      DistanceUnitSchema.optional(),
  sets:              z.array(SetEntrySchema).min(1),
})

// ─── Workout-level score ──────────────────────────────────────────────────────

// Captures the leaderboard-relevant score for Metcons / MonoStructural
// pieces. Strength results derive their score from `movementResults` and
// can omit this block.
export const ScoreSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ROUNDS_REPS'),
    rounds: z.number().int().nonnegative().optional(),
    reps: z.number().int().nonnegative(),
    cappedOut: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('TIME'),
    // 0 is legal when paired with cappedOut=true (member didn't finish).
    seconds: z.number().int().nonnegative(),
    cappedOut: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('LOAD'),
    load: z.number().positive(),
    unit: LoadUnitSchema,
  }),
  z.object({
    kind: z.literal('DISTANCE'),
    distance: z.number().positive(),
    unit: DistanceUnitSchema,
  }),
  z.object({
    kind: z.literal('CALORIES'),
    calories: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('REPS'),
    reps: z.number().int().nonnegative(),
  }),
])

// ─── Top-level value ──────────────────────────────────────────────────────────

// Stored as JSON in `Result.value`. Both fields are optional so callers can
// log Strength-only (movementResults only), Metcon-only (score only), or
// mixed. The API rejects rows with neither field populated.
export const ResultValueSchema = z
  .object({
    score:           ScoreSchema.optional(),
    movementResults: z.array(MovementResultSchema).default([]),
  })
  .refine(
    (v) => v.score !== undefined || (v.movementResults && v.movementResults.length > 0),
    { message: 'Result must include either a score or at least one movement result' },
  )

export type SetEntry       = z.infer<typeof SetEntrySchema>
export type MovementResult = z.infer<typeof MovementResultSchema>
export type Score          = z.infer<typeof ScoreSchema>
export type ResultValue    = z.infer<typeof ResultValueSchema>

// ─── Level / gender / wrappers ────────────────────────────────────────────────

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

// ─── Age divisions (CrossFit Games model) ─────────────────────────────────────

export type AgeDivision =
  | 'OPEN'
  | 'TEEN_14_15'
  | 'TEEN_16_17'
  | 'MASTERS_35_39'
  | 'MASTERS_40_44'
  | 'MASTERS_45_49'
  | 'MASTERS_50_54'
  | 'MASTERS_55_59'
  | 'MASTERS_60_64'
  | 'MASTERS_65_69'
  | 'MASTERS_70_PLUS'

export const AGE_DIVISIONS: { value: AgeDivision; label: string; minAge: number; maxAge: number | null }[] = [
  { value: 'OPEN',           label: 'Open (18–34)',    minAge: 18, maxAge: 34 },
  { value: 'TEEN_14_15',     label: 'Teen (14–15)',    minAge: 14, maxAge: 15 },
  { value: 'TEEN_16_17',     label: 'Teen (16–17)',    minAge: 16, maxAge: 17 },
  { value: 'MASTERS_35_39',  label: 'Masters (35–39)', minAge: 35, maxAge: 39 },
  { value: 'MASTERS_40_44',  label: 'Masters (40–44)', minAge: 40, maxAge: 44 },
  { value: 'MASTERS_45_49',  label: 'Masters (45–49)', minAge: 45, maxAge: 49 },
  { value: 'MASTERS_50_54',  label: 'Masters (50–54)', minAge: 50, maxAge: 54 },
  { value: 'MASTERS_55_59',  label: 'Masters (55–59)', minAge: 55, maxAge: 59 },
  { value: 'MASTERS_60_64',  label: 'Masters (60–64)', minAge: 60, maxAge: 64 },
  { value: 'MASTERS_65_69',  label: 'Masters (65–69)', minAge: 65, maxAge: 69 },
  { value: 'MASTERS_70_PLUS', label: 'Masters (70+)', minAge: 70, maxAge: null },
]

// Derives the CrossFit Games age division from a user's birthday and a
// reference date (typically the workout's scheduledAt). Returns null when
// birthday is unknown or the athlete is under 14 (no division defined).
export function getAgeDivision(
  birthday: string | null | undefined,
  workoutDate: string | Date,
): AgeDivision | null {
  if (!birthday) return null
  const dob = new Date(birthday)
  const ref = typeof workoutDate === 'string' ? new Date(workoutDate) : workoutDate
  let age = ref.getFullYear() - dob.getFullYear()
  const monthDiff = ref.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < dob.getDate())) age--
  for (const div of AGE_DIVISIONS) {
    if (age >= div.minAge && (div.maxAge === null || age <= div.maxAge)) return div.value
  }
  return null
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
