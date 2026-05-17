import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  prisma,
  Prisma,
  findWorkoutPlanForUser,
  upsertWorkoutPlanForUser,
  deleteWorkoutPlanForUser,
} from '@wodalytics/db'
import type { WorkoutLevel } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId, userGymIds, userProgramIds } from './shared.js'

const STAFF_ROLES = new Set(['OWNER', 'PROGRAMMER', 'COACH'])

// Mirrors hasWorkoutAccess in workouts.ts / results.ts — kept local because it
// is only used here and moving it to shared.ts would require a prisma import there.
async function hasWorkoutAccess(workoutId: string, userId: string): Promise<boolean> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: {
      programId: true,
      program: { select: { ownerUserId: true, gyms: { select: { gymId: true } } } },
    },
  })
  if (!workout) return false
  if (workout.program?.ownerUserId === userId) return true
  const gymIds = await userGymIds(userId)
  const programGymIds = workout.program?.gyms.map((g) => g.gymId) ?? []
  if (programGymIds.some((gid) => gymIds.includes(gid))) return true
  const programIds = await userProgramIds(userId)
  return workout.programId != null && programIds.includes(workout.programId)
}

// Returns true when callerId holds COACH, PROGRAMMER, or OWNER in any gym
// linked to the workout's program. Used to gate cross-user plan writes.
async function isGymStaffForWorkout(callerId: string, workoutId: string): Promise<boolean> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { program: { select: { gyms: { select: { gymId: true } } } } },
  })
  const gymIds = workout?.program?.gyms.map((g: { gymId: string }) => g.gymId) ?? []
  if (gymIds.length === 0) return false
  const membership = await prisma.userGym.findFirst({
    where: { userId: callerId, gymId: { in: gymIds }, role: { in: ['OWNER', 'PROGRAMMER', 'COACH'] } },
    select: { role: true },
  })
  return membership != null
}

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

      const accessible = await hasWorkoutAccess(args.workoutId, userId)
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
      const callerId = resolveUserId(ctxUserId, 'set_workout_plan')
      if (!callerId) return mcpUnauthorized()

      const targetUserId = args.userId ?? callerId

      if (targetUserId !== callerId) {
        const isStaff = await isGymStaffForWorkout(callerId, args.workoutId)
        if (!isStaff) {
          return {
            content: [{ type: 'text' as const, text: 'Forbidden — only coaches can set plans for other members' }],
            isError: true,
          }
        }
      } else {
        const accessible = await hasWorkoutAccess(args.workoutId, callerId)
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
        createdById: callerId,
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
      const callerId = resolveUserId(ctxUserId, 'delete_workout_plan')
      if (!callerId) return mcpUnauthorized()

      const targetUserId = args.userId ?? callerId

      if (targetUserId !== callerId) {
        const isStaff = await isGymStaffForWorkout(callerId, args.workoutId)
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
