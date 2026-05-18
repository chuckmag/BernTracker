import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  Prisma,
  findWorkoutPlanForUser,
  upsertWorkoutPlanForUser,
  deleteWorkoutPlanForUser,
  checkWorkoutAccessForUser,
  checkGymStaffAccessForWorkout,
  findWorkoutMovementsForPrescription,
} from '@wodalytics/db'
import type { WorkoutLevel } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId } from './shared.js'

// Build a ready-to-fill movementResults template for load-tracked movements.
// Each entry has the workoutMovementId, movement name, loadUnit, and a sets
// array pre-populated with reps from the workout prescription so the agent
// only needs to fill in the load values.
function buildPrescriptionTemplate(
  movements: Awaited<ReturnType<typeof findWorkoutMovementsForPrescription>>,
) {
  return movements
    .filter((m) => m.tracksLoad)
    .map((m) => ({
      workoutMovementId: m.workoutMovementId,
      movementName: m.movementName,
      loadUnit: m.loadUnit ?? 'LB',
      sets: Array.from({ length: m.prescribedSets ?? 1 }, () => ({
        ...(m.prescribedReps ? { reps: m.prescribedReps } : {}),
        load: m.prescribedLoad ?? null,
      })),
    }))
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
    `Create or update a workout plan. Omit userId to set your own plan; supply userId to set a plan for another member (requires COACH, PROGRAMMER, or OWNER role in the workout's gym). Idempotent — a second call replaces the previous plan.

**value.movementResults** — for strength workouts with load-tracked movements you MUST populate this field, or this tool will return an error with a ready-to-fill template. Supply skipPrescription: true only when explicitly bypassing structured prescription (e.g. a notes-only human edit).

value shape:
{
  "movementResults": [
    {
      "workoutMovementId": "<id from get_workout movements[].workoutMovementId>",
      "loadUnit": "LB",
      "sets": [
        { "reps": "5", "load": "225" },
        { "reps": "5", "load": "245" }
      ]
    }
  ]
}

The notes field supports Markdown — use it for stimulus cues, strategy, and context that doesn't fit in structured sets/reps/load.`,
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
        .describe('Structured prescription — must include movementResults for load-tracked workouts'),
      notes: z.string().optional().nullable().describe('Coach or personal notes — supports Markdown'),
      skipPrescription: z
        .boolean()
        .optional()
        .describe('Pass true to save without structured movementResults (bypass prescription validation). For human/notes-only edits.'),
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

      // Prescription validation: load-tracked movements require value.movementResults
      // unless the caller explicitly bypasses with skipPrescription.
      if (!args.skipPrescription) {
        const movements = await findWorkoutMovementsForPrescription(args.workoutId)
        const loadTracked = movements.filter((m) => m.tracksLoad)
        const hasMovementResults =
          Array.isArray((args.value as Record<string, unknown> | null | undefined)?.movementResults) &&
          ((args.value as Record<string, unknown>).movementResults as unknown[]).length > 0

        if (loadTracked.length > 0 && !hasMovementResults) {
          const template = buildPrescriptionTemplate(movements)
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: `This workout has ${loadTracked.length} load-tracked movement(s). Populate value.movementResults with per-set loads and retry, or pass skipPrescription: true to save without structured prescription.`,
                movementTemplate: template,
              }),
            }],
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
