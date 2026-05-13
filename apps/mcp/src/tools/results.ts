import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma, createResult, findWorkoutTypeById, detectAndUpsertStrengthPrs } from '@wodalytics/db'
import { ResultValueSchema, derivePrimaryScore } from '@wodalytics/types'
import { mcpUnauthorized, resolveUserId, userGymIds, userProgramIds } from './shared.js'
import type { WorkoutLevel, WorkoutGender } from '@wodalytics/db'

async function canReadPublicResults(workoutId: string): Promise<boolean> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { program: { select: { visibility: true, gyms: { select: { gymId: true } } } } },
  })
  if (!workout || !workout.program) return false
  const { gyms, visibility } = workout.program
  // Gym-linked programs are always readable
  if (gyms.length > 0) return true
  // Unaffiliated programs must be PUBLIC
  return visibility === 'PUBLIC'
}

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
  if (workout.program?.gyms.some((g) => gymIds.includes(g.gymId))) return true
  const pids = await userProgramIds(userId)
  return workout.programId != null && pids.includes(workout.programId)
}

export function registerResultTools(server: McpServer, ctxUserId?: string): void {
  server.tool(
    'get_workout_results',
    'Get public leaderboard results for a workout. Only available for gym-program or public-catalog workouts.',
    {
      workoutId: z.string().describe('Workout ID'),
      gender: z.enum(['MALE', 'FEMALE', 'OPEN']).optional().describe('Filter by workout gender category'),
      level: z
        .enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED'])
        .optional()
        .describe('Filter by workout level'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results (capped at 100)'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId)
      if (!userId) return mcpUnauthorized()

      const readable = await canReadPublicResults(args.workoutId)
      if (!readable) {
        return {
          content: [{ type: 'text' as const, text: 'Results not available — workout is in a private personal program' }],
          isError: true,
        }
      }

      const limit = Math.min(args.limit ?? 20, 100)

      const rows = await prisma.result.findMany({
        where: {
          workoutId: args.workoutId,
          ...(args.level ? { level: args.level as WorkoutLevel } : {}),
          ...(args.gender ? { workoutGender: args.gender as WorkoutGender } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ primaryScoreValue: 'asc' }],
        take: limit,
      })

      const leaderboard = rows.map((r, idx) => ({
        rank: idx + 1,
        displayName: r.user.name ?? r.user.email,
        value: r.value,
        level: r.level,
        workoutGender: r.workoutGender,
        notes: r.notes,
        createdAt: r.createdAt.toISOString(),
      }))

      return { content: [{ type: 'text' as const, text: JSON.stringify(leaderboard) }] }
    },
  )

  server.tool(
    'get_my_results',
    "Get your own results. Optionally filter by workout or program.",
    {
      workoutId: z.string().optional().describe('Filter to a specific workout ID'),
      programId: z.string().optional().describe('Filter to a specific program ID'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results (capped at 100)'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId)
      if (!userId) return mcpUnauthorized()

      const results = await prisma.result.findMany({
        where: {
          userId,
          ...(args.workoutId ? { workoutId: args.workoutId } : {}),
          ...(args.programId ? { workout: { programId: args.programId } } : {}),
        },
        orderBy: [{ workout: { scheduledAt: 'desc' } }, { createdAt: 'desc' }],
        take: Math.min(args.limit ?? 20, 100),
        include: {
          workout: { select: { id: true, title: true } },
        },
      })

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(results.map((r) => ({
            id: r.id,
            workoutId: r.workoutId,
            workoutTitle: r.workout.title,
            level: r.level,
            workoutGender: r.workoutGender,
            value: r.value,
            notes: r.notes,
            primaryScoreValue: r.primaryScoreValue,
            createdAt: r.createdAt.toISOString(),
          }))),
        }],
      }
    },
  )

  server.tool(
    'log_result',
    'Post a result for any workout you have access to. Value must match the ResultValue schema from packages/types.',
    {
      workoutId: z.string().describe('Workout ID'),
      level: z.enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED']).describe('Workout level'),
      workoutGender: z.enum(['MALE', 'FEMALE', 'OPEN']).describe('Leaderboard gender grouping'),
      value: z.record(z.unknown()).describe('Result value object — must include either a score or movementResults'),
      notes: z.string().optional().describe('Optional notes'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId)
      if (!userId) return mcpUnauthorized()

      const accessible = await hasWorkoutAccess(args.workoutId, userId)
      if (!accessible) {
        return {
          content: [{ type: 'text' as const, text: 'Workout not found or access denied' }],
          isError: true,
        }
      }

      const parsed = ResultValueSchema.safeParse(args.value)
      if (!parsed.success) {
        return {
          content: [{ type: 'text' as const, text: `Invalid result value: ${parsed.error.message}` }],
          isError: true,
        }
      }

      const primaryScore = derivePrimaryScore(parsed.data)

      try {
        const result = await createResult({
          userId,
          workoutId: args.workoutId,
          level: args.level as WorkoutLevel,
          workoutGender: args.workoutGender as WorkoutGender,
          value: parsed.data,
          notes: args.notes,
          primaryScoreKind: primaryScore?.kind ?? null,
          primaryScoreValue: primaryScore?.value ?? null,
        })

        const workoutType = await findWorkoutTypeById(args.workoutId)
        // Fire-and-forget PR detection — don't block the response on this
        detectAndUpsertStrengthPrs(result.id, result.value, workoutType ?? '', userId).catch(() => undefined)

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              id: result.id,
              workoutId: result.workoutId,
              level: result.level,
              workoutGender: result.workoutGender,
              primaryScoreValue: result.primaryScoreValue,
              createdAt: result.createdAt.toISOString(),
            }),
          }],
        }
      } catch (err: unknown) {
        if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 409) {
          return {
            content: [{ type: 'text' as const, text: 'You already have a result for this workout' }],
            isError: true,
          }
        }
        throw err
      }
    },
  )
}
