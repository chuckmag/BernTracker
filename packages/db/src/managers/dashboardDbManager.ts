import { prisma } from '../client.js'
import type { WorkoutType } from '../client.js'
import { findLeaderboardByWorkout } from './resultDbManager.js'

// Warmup and recovery types are shown after the main conditioning / strength
// piece in the ordered workouts list, not deprioritised entirely.
const RECOVERY_TYPES: WorkoutType[] = ['WARMUP', 'MOBILITY', 'COOLDOWN']

function todayUtcRange() {
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return { dayStart, dayEnd }
}

const workoutInclude = {
  program: { select: { id: true, name: true } },
  namedWorkout: { select: { id: true, name: true, category: true } },
  workoutMovements: {
    include: { movement: { select: { id: true, name: true, parentId: true } } },
    orderBy: { displayOrder: 'asc' as const },
  },
  _count: { select: { results: true } },
} as const

async function findAllTodaysWorkouts(gymId: string, userId: string, programIds?: string[]) {
  const { dayStart, dayEnd } = todayUtcRange()

  const baseWhere = {
    scheduledAt: { gte: dayStart, lt: dayEnd },
    status: 'PUBLISHED' as const,
    ...(programIds?.length ? { programId: { in: programIds } } : {}),
    OR: [
      { program: { gyms: { some: { gymId } } } },
      {
        program: {
          gyms: { none: {} },
          members: { some: { userId } },
        },
      },
    ],
  }

  const workouts = await prisma.workout.findMany({
    where: baseWhere,
    orderBy: [{ dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: workoutInclude,
  })

  // Non-recovery first, then warmup / mobility / cooldown.
  const nonRecovery = workouts.filter((w) => !RECOVERY_TYPES.includes(w.type))
  const recovery = workouts.filter((w) => RECOVERY_TYPES.includes(w.type))
  return [...nonRecovery, ...recovery]
}

export async function getDashboardToday(gymId: string, userId: string, programIds?: string[]) {
  const [workouts, gymMemberCount] = await Promise.all([
    findAllTodaysWorkouts(gymId, userId, programIds),
    prisma.userGym.count({ where: { gymId } }),
  ])

  if (workouts.length === 0) {
    return { workouts: [], gymMemberCount }
  }

  const workoutEntries = await Promise.all(
    workouts.map(async (workout) => {
      const heroProgramId = workout.program?.id

      const [myResult, allResults, gymProgram, programSubscriberCount] = await Promise.all([
        prisma.result.findUnique({
          where: { userId_workoutId: { userId, workoutId: workout.id } },
          select: {
            id: true,
            value: true,
            level: true,
            workoutGender: true,
            primaryScoreKind: true,
            primaryScoreValue: true,
            createdAt: true,
            notes: true,
          },
        }),
        findLeaderboardByWorkout(workout.id, {}),
        heroProgramId
          ? prisma.gymProgram.findUnique({ where: { gymId_programId: { gymId, programId: heroProgramId } } })
          : Promise.resolve(null),
        heroProgramId
          ? prisma.userProgram.count({ where: { programId: heroProgramId } })
          : Promise.resolve(0),
      ])

      const isHeroWorkoutGymAffiliated = !!gymProgram
      const userRank = myResult ? allResults.findIndex((r) => r.userId === userId) + 1 : null

      return {
        workout,
        myResult,
        leaderboard: {
          rank: userRank,
          totalLogged: allResults.length,
          percentile:
            userRank && allResults.length > 0
              ? Math.round((1 - userRank / allResults.length) * 100)
              : null,
        },
        programSubscriberCount,
        isHeroWorkoutGymAffiliated,
      }
    }),
  )

  return { workouts: workoutEntries, gymMemberCount }
}
