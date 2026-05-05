import { prisma } from '@wodalytics/db'
import type { WorkoutType } from '@wodalytics/db'
import { findLeaderboardByWorkout } from './resultDbManager.js'

// Warmup and recovery types are deprioritised — prefer a real conditioning
// or strength piece as the hero workout for the day.
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

async function findTodaysHeroWorkout(gymId: string, userId: string, programIds?: string[]) {
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

  const preferred = await prisma.workout.findFirst({
    where: { ...baseWhere, type: { notIn: RECOVERY_TYPES } },
    orderBy: [{ dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: workoutInclude,
  })
  if (preferred) return preferred

  return prisma.workout.findFirst({
    where: baseWhere,
    orderBy: [{ dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: workoutInclude,
  })
}

export async function getDashboardToday(gymId: string, userId: string, programIds?: string[]) {
  const [workout, gymMemberCount] = await Promise.all([
    findTodaysHeroWorkout(gymId, userId, programIds),
    prisma.userGym.count({ where: { gymId } }),
  ])

  if (!workout) {
    return { workout: null, myResult: null, leaderboard: null, gymMemberCount }
  }

  const [myResult, allResults] = await Promise.all([
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
  ])

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
    gymMemberCount,
  }
}
