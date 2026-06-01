import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  createGoalForUser,
  findGoalById,
  findGoalsForUser,
  updateGoalByOwner,
  deleteGoalByOwner,
  computeGoalProgress,
} from '@wodalytics/db'
import type { GoalWithRelations } from '@wodalytics/db'
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
    'Create an open-ended Habit goal (e.g. "avoid added sugars"). v1 has no per-day check-ins — completion is manual via update_my_goal { status: COMPLETED }. Daily tracking lands in v2.',
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
}
