import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma, WorkoutStatus, findWorkoutById, findDefaultProgramIdForGym } from '@wodalytics/db'
import { mcpUnauthorized, resolveUserId, userGymIds, userProgramIds } from './shared.js'

const workoutMovementsInclude = {
  workoutMovements: {
    orderBy: { displayOrder: 'asc' as const },
    include: { movement: { select: { id: true, name: true, parentId: true } } },
  },
} as const

interface WorkoutWithMovements {
  id: string
  title: string
  description: string
  type: string
  status: string
  scheduledAt: Date
  programId: string | null
  program: { name: string } | null
  workoutMovements: Array<{
    movementId: string
    movement: { name: string }
    displayOrder: number
    sets: number | null
    reps: string | null
    load: number | null
    loadUnit: string | null
    tracksLoad: boolean
    tempo: string | null
    distance: number | null
    distanceUnit: string | null
    calories: number | null
    seconds: number | null
  }>
}

function serializeWorkout(w: WorkoutWithMovements | null) {
  if (!w) return null
  return {
    id: w.id,
    title: w.title,
    description: w.description,
    type: w.type,
    status: w.status,
    scheduledAt: w.scheduledAt.toISOString(),
    programId: w.programId,
    programName: w.program?.name ?? null,
    movements: w.workoutMovements.map((wm) => ({
      movementId: wm.movementId,
      movementName: wm.movement.name,
      displayOrder: wm.displayOrder,
      sets: wm.sets,
      reps: wm.reps,
      load: wm.load,
      loadUnit: wm.loadUnit,
      tracksLoad: wm.tracksLoad,
      tempo: wm.tempo,
      distance: wm.distance,
      distanceUnit: wm.distanceUnit,
      calories: wm.calories,
      seconds: wm.seconds,
    })),
  }
}

async function hasWorkoutAccess(workoutId: string, userId: string): Promise<boolean> {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: {
      programId: true,
      program: {
        select: {
          ownerUserId: true,
          gyms: { select: { gymId: true } },
        },
      },
    },
  })
  if (!workout) return false

  // Personal program owner always has access
  if (workout.program?.ownerUserId === userId) return true

  const gymIds = await userGymIds(userId)
  const programGymIds = workout.program?.gyms.map((g) => g.gymId) ?? []
  if (programGymIds.some((gid) => gymIds.includes(gid))) return true

  const programIds = await userProgramIds(userId)
  if (workout.programId && programIds.includes(workout.programId)) return true

  return false
}

export function registerWorkoutTools(server: McpServer, ctxUserId?: string): void {
  server.tool(
    'list_workouts',
    'List workouts the user can see — gym schedule and enrolled programs. Only PUBLISHED workouts are returned.',
    {
      programId: z.string().optional().describe('Filter to a specific program ID'),
      scheduledAfter: z.string().optional().describe('ISO date lower bound for scheduledAt (inclusive)'),
      scheduledBefore: z.string().optional().describe('ISO date upper bound for scheduledAt (inclusive)'),
      limit: z.number().int().min(1).max(50).optional().default(20).describe('Max results (capped at 50)'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'list_workouts')
      if (!userId) return mcpUnauthorized()

      const gymIds = await userGymIds(userId)
      const programIds = await userProgramIds(userId)

      const dateFilter = args.scheduledAfter || args.scheduledBefore
        ? {
            scheduledAt: {
              ...(args.scheduledAfter ? { gte: new Date(args.scheduledAfter) } : {}),
              ...(args.scheduledBefore ? { lte: new Date(args.scheduledBefore) } : {}),
            },
          }
        : {}

      const workouts = await prisma.workout.findMany({
        where: {
          status: WorkoutStatus.PUBLISHED,
          ...dateFilter,
          ...(args.programId ? { programId: args.programId } : {
            OR: [
              { program: { gyms: { some: { gymId: { in: gymIds } } } } },
              { programId: { in: programIds } },
            ],
          }),
        },
        orderBy: [{ scheduledAt: 'asc' }, { dayOrder: 'asc' }],
        take: Math.min(args.limit ?? 20, 50),
        include: {
          program: { select: { id: true, name: true } },
          ...workoutMovementsInclude,
        },
      })

      // If a programId filter was given, verify access
      if (args.programId) {
        const accessible = gymIds.length > 0 || programIds.includes(args.programId)
        if (!accessible) {
          return { content: [{ type: 'text' as const, text: 'Access denied — you are not enrolled in that program' }], isError: true }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(workouts.map((w) => ({
            id: w.id,
            title: w.title,
            type: w.type,
            scheduledAt: w.scheduledAt.toISOString(),
            programId: w.programId,
            programName: w.program?.name ?? null,
          }))),
        }],
      }
    },
  )

  server.tool(
    'get_workout',
    'Get full workout detail including movements. Returns an error for workouts you cannot access.',
    {
      workoutId: z.string().describe('Workout ID'),
    },
    async (args) => {
      const userId = resolveUserId(ctxUserId, 'get_workout')
      if (!userId) return mcpUnauthorized()

      const accessible = await hasWorkoutAccess(args.workoutId, userId)
      if (!accessible) {
        return { content: [{ type: 'text' as const, text: 'Workout not found or access denied' }], isError: true }
      }

      const workout = await findWorkoutById(args.workoutId)
      return { content: [{ type: 'text' as const, text: JSON.stringify(serializeWorkout(workout)) }] }
    },
  )

  server.tool(
    'get_today_workout',
    "Today's published workout from the user's gym default program. Returns null if none is scheduled.",
    {},
    async () => {
      const userId = resolveUserId(ctxUserId, 'get_today_workout')
      if (!userId) return mcpUnauthorized()

      const membership = await prisma.userGym.findFirst({
        where: { userId },
        select: { gymId: true },
      })
      if (!membership) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(null) }] }
      }

      const defaultProgramId = await findDefaultProgramIdForGym(membership.gymId)
      if (!defaultProgramId) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(null) }] }
      }

      const now = new Date()
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

      const workout = await prisma.workout.findFirst({
        where: {
          programId: defaultProgramId,
          status: WorkoutStatus.PUBLISHED,
          scheduledAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { dayOrder: 'asc' },
        include: {
          program: { select: { id: true, name: true } },
          namedWorkout: { select: { id: true, name: true, category: true } },
          ...workoutMovementsInclude,
        },
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(serializeWorkout(workout)) }] }
    },
  )
}
