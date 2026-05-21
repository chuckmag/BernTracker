import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  createGoalForUser,
  findGoalById,
  findGoalsForUser,
  updateGoalByOwner,
  deleteGoalByOwner,
  computeGoalProgress,
  recordCheckIn,
  deleteCheckIn,
  findCheckInsForGoal,
} from '@wodalytics/db'
import type { GoalWithRelations, GoalCheckIn } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId } from './shared.js'

// ─── Shared response shaping ─────────────────────────────────────────────────

// Mirrors the wire shape `apps/api/src/routes/goals.ts` returns — keeps the
// MCP and REST responses identical so the LLM sees the same fields whether
// the user is talking to it or hitting the API directly.
async function shapeGoal(goal: GoalWithRelations) {
  const progress = await computeGoalProgress(goal)
  return {
    id: goal.id,
    type: goal.type,
    status: goal.status,
    title: goal.title,
    targetDate: goal.targetDate ? goal.targetDate.toISOString() : null,
    movementId: goal.movementId,
    namedWorkoutId: goal.namedWorkoutId,
    targetPrType: goal.targetPrType,
    targetValue: goal.targetValue,
    targetLoadUnit: goal.targetLoadUnit,
    targetDistanceUnit: goal.targetDistanceUnit,
    targetRepCount: goal.targetRepCount,
    frequencyPerWeek: goal.frequencyPerWeek,
    frequencyWeeks: goal.frequencyWeeks,
    frequencyStartDate: goal.frequencyStartDate ? goal.frequencyStartDate.toISOString() : null,
    completedAt: goal.completedAt ? goal.completedAt.toISOString() : null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    movement: goal.movement,
    namedWorkout: goal.namedWorkout,
    progress,
  }
}

function asJson(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function asError(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerGoalTools(server: McpServer, ctxUserId?: string): void {
  // ─── Read ──────────────────────────────────────────────────────────────────

  server.tool(
    'list_my_goals',
    'List your personal goals. Optionally filter by status. Returns each goal with its computed progress (ring %, current/target, etc.).',
    {
      status: z
        .enum(['ACTIVE', 'COMPLETED', 'ARCHIVED'])
        .optional()
        .describe('Filter by lifecycle status. Omit to return all goals.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'list_my_goals')
      if (!userId) return mcpUnauthorized()

      const goals = await findGoalsForUser(userId, { status: args.status })
      const shaped = await Promise.all(goals.map(shapeGoal))
      return asJson(shaped)
    },
  )

  server.tool(
    'get_my_goal',
    'Get a single goal by id, including its computed progress. You can only read your own goals.',
    {
      goalId: z.string().describe('Goal ID returned by list_my_goals'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'get_my_goal')
      if (!userId) return mcpUnauthorized()

      const goal = await findGoalById(args.goalId)
      if (!goal) return asError('Goal not found')
      if (goal.userId !== userId) return asError('You can only read your own goals')

      return asJson(await shapeGoal(goal))
    },
  )

  // ─── Create — one tool per goal type ───────────────────────────────────────
  //
  // Three separate `create_*` tools instead of one polymorphic `create_goal`:
  // each schema can declare exactly which fields are required for that
  // variant, so the LLM can pick the right tool by intent and never has to
  // reason about cross-type field combinations.

  server.tool(
    'create_pr_target_goal',
    'Create a PR Target goal — chase a target PR on a movement (LOAD/MAX_REPS/TIME/DISTANCE/CALORIES) or a benchmark workout (Fran, Murph, etc.). Exactly one of movementId or namedWorkoutId.',
    {
      title: z.string().min(1).describe('e.g. "Back Squat 1RM 315 lb" or "Fran sub-4:00"'),
      movementId: z.string().optional().describe('Movement to chase a PR on. XOR with namedWorkoutId.'),
      namedWorkoutId: z.string().optional().describe('Benchmark workout (Fran, Murph, etc.). XOR with movementId.'),
      targetPrType: z
        .enum(['LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES'])
        .describe('Which PR dimension is being chased. TIME comparisons are direction-aware (lower is better).'),
      targetValue: z.number().positive().describe('Numeric target — weight, seconds, reps, distance, or calories.'),
      targetLoadUnit: z.enum(['LB', 'KG']).optional().describe('Required when targetPrType=LOAD.'),
      targetDistanceUnit: z.enum(['M', 'KM', 'MI', 'FT', 'YD']).optional().describe('Required when targetPrType=DISTANCE.'),
      targetRepCount: z.number().int().positive().optional().describe('Required when targetPrType=LOAD — 1 for 1RM, 3 for 3RM, etc.'),
      targetDate: z
        .string()
        .datetime()
        .optional()
        .describe('Optional target date (ISO 8601). Strongly encouraged — time-bound goals are easier to achieve.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'create_pr_target_goal')
      if (!userId) return mcpUnauthorized()

      // Cross-field validation — mirrors the API's Zod superRefine so the LLM
      // gets the same errors regardless of which transport it used.
      const movementSet = args.movementId !== undefined
      const namedSet = args.namedWorkoutId !== undefined
      if (movementSet === namedSet) {
        return asError('Exactly one of movementId or namedWorkoutId must be set')
      }
      if (args.targetPrType === 'LOAD') {
        if (args.targetLoadUnit === undefined) return asError('LOAD goals require targetLoadUnit')
        if (args.targetRepCount === undefined) return asError('LOAD goals require targetRepCount')
      }
      if (args.targetPrType === 'DISTANCE' && args.targetDistanceUnit === undefined) {
        return asError('DISTANCE goals require targetDistanceUnit')
      }

      const goal = await createGoalForUser(userId, {
        type: 'PR_TARGET',
        title: args.title,
        targetDate: args.targetDate ? new Date(args.targetDate) : null,
        movementId: args.movementId ?? null,
        namedWorkoutId: args.namedWorkoutId ?? null,
        targetPrType: args.targetPrType,
        targetValue: args.targetValue,
        targetLoadUnit: args.targetLoadUnit ?? null,
        targetDistanceUnit: args.targetDistanceUnit ?? null,
        targetRepCount: args.targetRepCount ?? null,
      })
      return asJson(await shapeGoal(goal))
    },
  )

  server.tool(
    'create_frequency_goal',
    'Create a Frequency goal — log N workouts per week for M weeks. Progress increments automatically as you log results.',
    {
      title: z.string().min(1).describe('e.g. "3 workouts/week for 8 weeks"'),
      frequencyPerWeek: z.number().int().min(1).max(14).describe('Target workouts per week (1–14).'),
      frequencyWeeks: z.number().int().min(1).max(52).describe('How many weeks the cadence runs (1–52).'),
      frequencyStartDate: z
        .string()
        .datetime()
        .optional()
        .describe('When the rolling window begins. Defaults to now.'),
      targetDate: z.string().datetime().optional().describe('Optional target date (ISO 8601).'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'create_frequency_goal')
      if (!userId) return mcpUnauthorized()

      const goal = await createGoalForUser(userId, {
        type: 'FREQUENCY',
        title: args.title,
        targetDate: args.targetDate ? new Date(args.targetDate) : null,
        frequencyPerWeek: args.frequencyPerWeek,
        frequencyWeeks: args.frequencyWeeks,
        frequencyStartDate: args.frequencyStartDate ? new Date(args.frequencyStartDate) : null,
      })
      return asJson(await shapeGoal(goal))
    },
  )

  server.tool(
    'create_habit_goal',
    'Create an open-ended Habit goal (e.g. "avoid added sugars"). Record per-day check-ins via record_habit_check_in once the goal exists. Progress (currentStreak, longestStreak, weekCheckIns, last7Days) shows up automatically on list_my_goals / get_my_goal.',
    {
      title: z.string().min(1).describe('e.g. "Avoid added sugars"'),
      targetDate: z.string().datetime().optional().describe('Optional target date (ISO 8601).'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'create_habit_goal')
      if (!userId) return mcpUnauthorized()

      const goal = await createGoalForUser(userId, {
        type: 'HABIT',
        title: args.title,
        targetDate: args.targetDate ? new Date(args.targetDate) : null,
      })
      return asJson(await shapeGoal(goal))
    },
  )

  // ─── Update / Delete ───────────────────────────────────────────────────────

  server.tool(
    'update_my_goal',
    'Update a goal — rename, change the target date, or change status (e.g. mark a Habit goal COMPLETED, or archive a Frequency goal). Target value / type fields aren\'t editable in v1; delete and re-create instead.',
    {
      goalId: z.string().describe('Goal ID returned by list_my_goals.'),
      title: z.string().min(1).optional().describe('New title.'),
      targetDate: z
        .string()
        .datetime()
        .nullable()
        .optional()
        .describe('New target date (ISO 8601). Pass null to clear.'),
      status: z
        .enum(['ACTIVE', 'COMPLETED', 'ARCHIVED'])
        .optional()
        .describe('Transition lifecycle. Setting COMPLETED sets completedAt; flipping back to ACTIVE clears it.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'update_my_goal')
      if (!userId) return mcpUnauthorized()

      try {
        const goal = await updateGoalByOwner(args.goalId, userId, {
          title: args.title,
          targetDate:
            args.targetDate === undefined
              ? undefined
              : args.targetDate === null
                ? null
                : new Date(args.targetDate),
          status: args.status,
        })
        return asJson(await shapeGoal(goal))
      } catch (err: unknown) {
        const code = (err as Error & { statusCode?: number }).statusCode
        if (code === 404) return asError('Goal not found')
        if (code === 403) return asError('You can only update your own goals')
        throw err
      }
    },
  )

  server.tool(
    'delete_my_goal',
    'Permanently delete a goal. Prefer update_my_goal with status=ARCHIVED if you want to keep the record for history.',
    {
      goalId: z.string().describe('Goal ID to delete.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'delete_my_goal')
      if (!userId) return mcpUnauthorized()

      try {
        await deleteGoalByOwner(args.goalId, userId)
        return asJson({ deleted: true, goalId: args.goalId })
      } catch (err: unknown) {
        const code = (err as Error & { statusCode?: number }).statusCode
        if (code === 404) return asError('Goal not found')
        if (code === 403) return asError('You can only delete your own goals')
        throw err
      }
    },
  )

  // ─── Habit check-ins ────────────────────────────────────────────────────────
  //
  // Per-day confirmation that a HABIT-type goal was honored. Only valid on
  // HABIT goals — PR_TARGET / FREQUENCY reject with an error. The refreshed
  // goal returned by record / undo carries the new HABIT progress shape
  // (currentStreak, longestStreak, weekCheckIns, last7Days, etc.) so an
  // LLM can act on the result without a second list_my_goals call.

  server.tool(
    'record_habit_check_in',
    'Record a per-day check-in on a HABIT goal (e.g. "I avoided sugar today"). Idempotent — re-tapping the same day updates the note instead of duplicating. Date defaults to today (UTC) when omitted. Returns the new check-in plus the refreshed goal (with currentStreak, weekCheckIns, last7Days).',
    {
      goalId: z.string().describe('Goal ID — must be a HABIT goal owned by the caller.'),
      date: z
        .string()
        .optional()
        .describe('Optional ISO 8601 datetime or YYYY-MM-DD. Defaults to today (UTC).'),
      note: z
        .string()
        .max(280)
        .optional()
        .describe('Optional free-text note (≤ 280 chars). Re-tapping with a new note replaces the previous one.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'record_habit_check_in')
      if (!userId) return mcpUnauthorized()

      const goal = await loadOwnedHabitGoal(args.goalId, userId)
      if (typeof goal === 'string') return asError(goal)

      const date = args.date ? parseDateArg(args.date) : new Date()
      if (!date) return asError('Date must be a valid YYYY-MM-DD or ISO 8601 datetime')

      const row = await recordCheckIn({ goalId: goal.id, userId, date, note: args.note })
      return asJson({ checkIn: shapeCheckIn(row), goal: await shapeGoal(goal) })
    },
  )

  server.tool(
    'undo_my_habit_check_in',
    'Remove a previously-recorded HABIT check-in by date. Returns an error if no check-in exists for that date. Use this if you accidentally tapped — the streak will recompute on the next list_my_goals / get_my_goal call.',
    {
      goalId: z.string().describe('Goal ID — must be a HABIT goal owned by the caller.'),
      date: z
        .string()
        .describe('Date of the check-in to remove (YYYY-MM-DD or ISO 8601). Required.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'undo_my_habit_check_in')
      if (!userId) return mcpUnauthorized()

      const goal = await loadOwnedHabitGoal(args.goalId, userId)
      if (typeof goal === 'string') return asError(goal)

      const date = parseDateArg(args.date)
      if (!date) return asError('Date must be a valid YYYY-MM-DD or ISO 8601 datetime')

      const deleted = await deleteCheckIn(goal.id, date)
      if (!deleted) return asError('No check-in for that date')
      return asJson({ goal: await shapeGoal(goal) })
    },
  )

  server.tool(
    'list_my_habit_check_ins',
    'List check-in rows for one of your HABIT goals, newest first. Use this to render a history view. For aggregate streak/week counts, prefer get_my_goal which includes them in the progress field.',
    {
      goalId: z.string().describe('Goal ID — must be a HABIT goal owned by the caller.'),
      since: z
        .string()
        .optional()
        .describe('Earliest date to include (YYYY-MM-DD or ISO 8601, inclusive).'),
      until: z
        .string()
        .optional()
        .describe('Latest date to include (YYYY-MM-DD or ISO 8601, inclusive).'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum rows to return (1–500). Omit for all matching rows.'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'list_my_habit_check_ins')
      if (!userId) return mcpUnauthorized()

      const goal = await loadOwnedHabitGoal(args.goalId, userId)
      if (typeof goal === 'string') return asError(goal)

      const since = args.since ? parseDateArg(args.since) : undefined
      const until = args.until ? parseDateArg(args.until) : undefined
      if (args.since !== undefined && !since) return asError('since must be a valid date')
      if (args.until !== undefined && !until) return asError('until must be a valid date')

      const rows = await findCheckInsForGoal(goal.id, {
        since: since ?? undefined,
        until: until ?? undefined,
        limit: args.limit,
      })
      return asJson(rows.map(shapeCheckIn))
    },
  )
}

// ─── Habit-check-in helpers ───────────────────────────────────────────────────

// Returns the goal on success, or a human-readable error string the caller
// passes to asError. Mirrors the REST `loadOwnedHabitGoal` preflight.
async function loadOwnedHabitGoal(
  goalId: string,
  userId: string,
): Promise<GoalWithRelations | string> {
  const goal = await findGoalById(goalId)
  if (!goal) return 'Goal not found'
  if (goal.userId !== userId) return 'You can only act on your own goals'
  if (goal.type !== 'HABIT') return 'Check-ins are only valid for habit goals'
  return goal
}

// Accepts YYYY-MM-DD or ISO 8601. Returns null on malformed input.
function parseDateArg(raw: string): Date | null {
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = Number(ymdMatch[2])
    const day = Number(ymdMatch[3])
    const d = new Date(Date.UTC(year, month - 1, day))
    if (
      d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 ||
      d.getUTCDate() !== day
    ) {
      return null
    }
    return d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function shapeCheckIn(row: GoalCheckIn) {
  const d = row.date
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return {
    id: row.id,
    goalId: row.goalId,
    date: `${d.getUTCFullYear()}-${m}-${day}`,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  }
}
