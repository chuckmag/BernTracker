import { z } from 'zod'
import { LoadUnitSchema, DistanceUnitSchema } from './result.js'
import { MovementPrTypeSchema } from './movement.js'

// ─── Enums (mirror Prisma) ────────────────────────────────────────────────────

export const GoalTypeSchema = z.enum(['PR_TARGET', 'FREQUENCY', 'HABIT'])
export const GoalStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED'])

export type GoalType = z.infer<typeof GoalTypeSchema>
export type GoalStatus = z.infer<typeof GoalStatusSchema>

// PR-target goals exclude `NONE` — a member can't chase a PR on a movement
// that doesn't track any PR.
export const TargetPrTypeSchema = z.enum(['LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES'])
export type TargetPrType = z.infer<typeof TargetPrTypeSchema>

// ─── Create input ─────────────────────────────────────────────────────────────

// PR Target: chase a target PR on a Movement OR a NamedWorkout. Cross-field
// invariants (XOR movementId/namedWorkoutId, LOAD needs unit+repCount,
// DISTANCE needs unit) are enforced in `CreateGoalSchema.superRefine`
// below — `z.discriminatedUnion` requires plain ZodObject members and
// rejects `.refine`'d schemas.
const PrTargetGoalInputSchema = z.object({
  type: z.literal('PR_TARGET'),
  title: z.string().min(1, 'Title is required'),
  targetDate: z.string().datetime().optional(),
  movementId: z.string().min(1).optional(),
  namedWorkoutId: z.string().min(1).optional(),
  targetPrType: TargetPrTypeSchema,
  targetValue: z.number().positive(),
  targetLoadUnit: LoadUnitSchema.optional(),
  targetDistanceUnit: DistanceUnitSchema.optional(),
  // For LOAD goals: which rep PR is being chased (1RM, 3RM, …). Matches
  // MovementPR.repCount.
  targetRepCount: z.number().int().positive().optional(),
})

const FrequencyGoalInputSchema = z.object({
  type: z.literal('FREQUENCY'),
  title: z.string().min(1, 'Title is required'),
  targetDate: z.string().datetime().optional(),
  frequencyPerWeek: z.number().int().min(1).max(14),
  frequencyWeeks: z.number().int().min(1).max(52),
  frequencyStartDate: z.string().datetime().optional(),
})

// HABIT in v1: creation only. The shape carries title + optional targetDate;
// all PR Target / Frequency columns must stay null. Per-day check-ins land
// in v2 via a GoalCheckIn sibling table.
const HabitGoalInputSchema = z.object({
  type: z.literal('HABIT'),
  title: z.string().min(1, 'Title is required'),
  targetDate: z.string().datetime().optional(),
})

export const CreateGoalSchema = z
  .discriminatedUnion('type', [
    PrTargetGoalInputSchema,
    FrequencyGoalInputSchema,
    HabitGoalInputSchema,
  ])
  .superRefine((data, ctx) => {
    if (data.type !== 'PR_TARGET') return
    const movementSet = data.movementId !== undefined
    const namedSet = data.namedWorkoutId !== undefined
    if (movementSet === namedSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exactly one of movementId or namedWorkoutId must be set',
        path: ['movementId'],
      })
    }
    if (data.targetPrType === 'LOAD') {
      if (data.targetLoadUnit === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LOAD goals require targetLoadUnit',
          path: ['targetLoadUnit'],
        })
      }
      if (data.targetRepCount === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LOAD goals require targetRepCount',
          path: ['targetRepCount'],
        })
      }
    }
    if (data.targetPrType === 'DISTANCE' && data.targetDistanceUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DISTANCE goals require targetDistanceUnit',
        path: ['targetDistanceUnit'],
      })
    }
  })

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>

// ─── Update input ─────────────────────────────────────────────────────────────

// PATCH supports light edits only — title, target date, and manual status
// transitions (e.g. user marking a HABIT goal COMPLETED, or archiving an
// ACTIVE goal). The PR Target / Frequency target fields are intentionally
// not editable in v1 — if the user wants to change them, they delete and
// recreate. Keeps progress comparisons honest.
export const UpdateGoalSchema = z.object({
  title: z.string().min(1).optional(),
  targetDate: z.string().datetime().nullable().optional(),
  status: GoalStatusSchema.optional(),
})

export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>

// ─── Response shapes ──────────────────────────────────────────────────────────

// Computed progress, discriminated by goal type. Returned by both list and
// detail endpoints so the UI never has to re-derive it.
//
// For PR_TARGET:
//   `current`  — best value observed so far; null if no result/PR exists yet
//   `target`   — the goal's target value (echo of Goal.targetValue)
//   `unit`     — display unit (e.g. "LB", "s", "reps"); UI-facing string
//   `percent`  — 0–100, clamped; semantically meaningful even when isComplete
//   `isComplete` — direction-aware: TIME goals complete when current <= target;
//                  every other PR type completes when current >= target
//
// For FREQUENCY:
//   `workoutsLogged`   — count over the rolling window so far
//   `workoutsRequired` — perWeek × weeks
//   `weeksRemaining`   — weeks left in the window (>= 0)
//   `currentWeekCount` — how many workouts in the current week
//
// For HABIT: no fields in v1 — the UI shows a manual Complete toggle.
export type GoalProgress =
  | {
      type: 'PR_TARGET'
      current: number | null
      target: number
      unit: string | null
      percent: number
      isComplete: boolean
    }
  | {
      type: 'FREQUENCY'
      workoutsLogged: number
      workoutsRequired: number
      percent: number
      weeksRemaining: number
      currentWeekCount: number
      isComplete: boolean
    }
  | { type: 'HABIT' }

// Wire shape for a Goal returned from the API. Dates are ISO strings; all
// per-type columns are present so the UI can read them without conditional
// branches at the parse layer.
export interface GoalResponse {
  id: string
  userId: string
  type: GoalType
  status: GoalStatus
  title: string
  targetDate: string | null

  movementId: string | null
  namedWorkoutId: string | null
  targetPrType: TargetPrType | null
  targetValue: number | null
  targetLoadUnit: 'LB' | 'KG' | null
  targetDistanceUnit: 'M' | 'KM' | 'MI' | 'FT' | 'YD' | null
  targetRepCount: number | null

  frequencyPerWeek: number | null
  frequencyWeeks: number | null
  frequencyStartDate: string | null

  completedAt: string | null
  createdAt: string
  updatedAt: string

  movement: { id: string; name: string } | null
  namedWorkout: { id: string; name: string } | null

  progress: GoalProgress
}
