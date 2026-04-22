import { prisma } from '@berntracker/db'
import type { WorkoutLevel, WorkoutGender, WorkoutType, Prisma } from '@berntracker/db'

interface CreateResultData {
  userId: string
  workoutId: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: Prisma.InputJsonValue
  notes?: string
}

interface LeaderboardFilters {
  level?: WorkoutLevel
  workoutGender?: WorkoutGender
}

interface Pagination {
  page: number
  limit: number
  movementIds?: string[]
}

type LeaderboardEntry = Awaited<ReturnType<typeof fetchLeaderboardRows>>[number]

async function fetchLeaderboardRows(workoutId: string, filters: LeaderboardFilters) {
  return prisma.result.findMany({
    where: {
      workoutId,
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.workoutGender ? { workoutGender: filters.workoutGender } : {}),
    },
    include: {
      user: { select: { id: true, name: true } },
      workout: { select: { type: true } },
    },
  })
}

function sortLeaderboard(results: LeaderboardEntry[], workoutType: WorkoutType) {
  return [...results].sort((a, b) => {
    const av = a.value as Record<string, number | boolean>
    const bv = b.value as Record<string, number | boolean>

    if (workoutType === 'AMRAP') {
      if (av.rounds !== bv.rounds) return (bv.rounds as number) - (av.rounds as number)
      return (bv.reps as number) - (av.reps as number)
    }

    if (workoutType === 'FOR_TIME') {
      // non-capped finishers beat capped-out
      if (av.cappedOut !== bv.cappedOut) return av.cappedOut ? 1 : -1
      return (av.seconds as number) - (bv.seconds as number)
    }

    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

export async function createResult(data: CreateResultData) {
  try {
    return await prisma.result.create({ data })
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      const conflict = new Error('Result already exists for this user and workout')
      ;(conflict as Error & { statusCode: number }).statusCode = 409
      throw conflict
    }
    throw err
  }
}

export async function findLeaderboardByWorkout(workoutId: string, filters: LeaderboardFilters) {
  const rows = await fetchLeaderboardRows(workoutId, filters)
  if (rows.length === 0) return []
  const workoutType = rows[0].workout.type
  return sortLeaderboard(rows, workoutType)
}

export async function updateResultByOwner(
  resultId: string,
  userId: string,
  data: { level?: WorkoutLevel; value?: Prisma.InputJsonValue; notes?: string | null },
) {
  const existing = await prisma.result.findUnique({ where: { id: resultId } })
  if (!existing) {
    const notFound = new Error('Result not found')
    ;(notFound as Error & { statusCode: number }).statusCode = 404
    throw notFound
  }
  if (existing.userId !== userId) {
    const forbidden = new Error('You do not own this result')
    ;(forbidden as Error & { statusCode: number }).statusCode = 403
    throw forbidden
  }
  return prisma.result.update({ where: { id: resultId }, data })
}

export async function deleteResultByOwner(resultId: string, userId: string) {
  const existing = await prisma.result.findUnique({ where: { id: resultId } })
  if (!existing) {
    const notFound = new Error('Result not found')
    ;(notFound as Error & { statusCode: number }).statusCode = 404
    throw notFound
  }
  if (existing.userId !== userId) {
    const forbidden = new Error('You do not own this result')
    ;(forbidden as Error & { statusCode: number }).statusCode = 403
    throw forbidden
  }
  await prisma.result.delete({ where: { id: resultId } })
}

export async function findResultHistoryByUser(userId: string, pagination: Pagination) {
  const { page, limit, movementIds } = pagination
  const skip = (page - 1) * limit
  const movementFilter = movementIds?.length
    ? { workout: { workoutMovements: { some: { movementId: { in: movementIds } } } } }
    : {}

  const [results, total] = await prisma.$transaction([
    prisma.result.findMany({
      where: { userId, ...movementFilter },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        workout: { select: { id: true, title: true, type: true, scheduledAt: true } },
      },
    }),
    prisma.result.count({ where: { userId, ...movementFilter } }),
  ])

  return { results, total, page, limit, pages: Math.ceil(total / limit) }
}
