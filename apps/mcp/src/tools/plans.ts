import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  Prisma,
  findWorkoutPlanForUser,
  upsertWorkoutPlanForUser,
  deleteWorkoutPlanForUser,
  checkWorkoutAccessForUser,
  checkGymStaffAccessForWorkout,
} from '@wodalytics/db'
import type { WorkoutLevel } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId } from './shared.js'

export function registerPlanTools(server: McpServer, ctxUserId?: string): void {
  server.tool(
    'get_my_workout_plan',
    "Get your personal workout plan for a specific workout. Returns null if no plan has been set yet. Use alongside list_workouts to review your week's planned approach before each session.",
    {
      workoutId: z.string().describe('Workout ID'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'get_my_workout_plan')
      if (!userId) return mcpUnauthorized()

      const accessible = await checkWorkoutAccessForUser(userId, args.workoutId)
      if (!accessible) {
        return {
          content: [{ type: 'text' as const, text: 'Workout not found or access denied' }],
          isError: true,
        }
      }

      const plan = await findWorkoutPlanForUser(userId, args.workoutId)
      return { content: [{ type: 'text' as const, text: JSON.stringify(plan) }] }
    },
  )

  server.tool(
    'set_workout_plan',
    "Create or update a workout plan. Omit userId to set your own plan; supply userId to set a plan for another member (requires COACH, PROGRAMMER, or OWNER role in the workout's gym). Idempotent — a second call replaces the previous plan. The notes field supports Markdown.",
    {
      workoutId: z.string().describe('Workout ID'),
      userId: z.string().optional().describe('Target member ID — omit to set your own plan'),
      level: z
        .enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED'])
        .optional()
        .describe('Planned level'),
      value: z
        .record(z.unknown())
        .optional()
        .nullable()
        .describe('movementResults JSON — same shape as Result.value but without a score block'),
      notes: z.string().optional().nullable().describe('Coach or personal notes — supports Markdown'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'set_workout_plan')
      if (!userId) return mcpUnauthorized()

      const targetUserId = args.userId ?? userId

      if (targetUserId !== userId) {
        const isStaff = await checkGymStaffAccessForWorkout(userId, args.workoutId)
        if (!isStaff) {
          return {
            content: [{ type: 'text' as const, text: 'Forbidden — only coaches can set plans for other members' }],
            isError: true,
          }
        }
      } else {
        const accessible = await checkWorkoutAccessForUser(userId, args.workoutId)
        if (!accessible) {
          return {
            content: [{ type: 'text' as const, text: 'Workout not found or access denied' }],
            isError: true,
          }
        }
      }

      const plan = await upsertWorkoutPlanForUser({
        userId: targetUserId,
        workoutId: args.workoutId,
        level: (args.level as WorkoutLevel | undefined) ?? null,
        value: args.value != null ? (args.value as Prisma.InputJsonValue) : Prisma.JsonNull,
        notes: args.notes ?? null,
        createdById: userId,
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(plan) }] }
    },
  )

  server.tool(
    'delete_workout_plan',
    "Delete a workout plan. Omit userId to delete your own plan; supply userId to delete another member's plan (requires COACH, PROGRAMMER, or OWNER role in the workout's gym).",
    {
      workoutId: z.string().describe('Workout ID'),
      userId: z.string().optional().describe("Target member ID — omit to delete your own plan"),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'delete_workout_plan')
      if (!userId) return mcpUnauthorized()

      const targetUserId = args.userId ?? userId

      if (targetUserId !== userId) {
        const isStaff = await checkGymStaffAccessForWorkout(userId, args.workoutId)
        if (!isStaff) {
          return {
            content: [{ type: 'text' as const, text: 'Forbidden — only coaches can delete plans for other members' }],
            isError: true,
          }
        }
      }

      try {
        await deleteWorkoutPlanForUser(targetUserId, args.workoutId)
        return { content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true }) }] }
      } catch (err) {
        if ((err as Error & { statusCode?: number }).statusCode === 404) {
          return {
            content: [{ type: 'text' as const, text: 'Plan not found' }],
            isError: true,
          }
        }
        throw err
      }
    },
  )
}
