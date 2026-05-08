import { prisma } from '@wodalytics/db'
import type { WorkoutLevel, WorkoutGender, Prisma, MovementCategory, LoadUnit } from '@wodalytics/db'

interface CreateResultData {
  userId: string
  workoutId: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: Prisma.InputJsonValue
  notes?: string
  primaryScoreKind?: string | null
  primaryScoreValue?: number | null
}

interface UpdateResultData {
  level?: WorkoutLevel
  value?: Prisma.InputJsonValue
  notes?: string | null
  primaryScoreKind?: string | null
  primaryScoreValue?: number | null
}

interface LeaderboardFilters {
  level?: WorkoutLevel
  workoutGender?: WorkoutGender
}

interface Pagination {
  page: number
  limit: number
  movementIds?: string[]
  programIds?: string[]
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
      user: { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, birthday: true } },
      workout: { select: { type: true } },
    },
  })
}

// `TIME` is the only ascending kind — every other primary-score kind ranks
// "more is better". Capped TIME results carry a large penalty addend so they
// sort after every finisher even on ascending order. Results with no primary
// score fall to the end (createdAt-stable).
function sortLeaderboard(results: LeaderboardEntry[]) {
  return [...results].sort((a, b) => {
    if (a.primaryScoreKind && b.primaryScoreKind && a.primaryScoreKind === b.primaryScoreKind) {
      const av = a.primaryScoreValue ?? 0
      const bv = b.primaryScoreValue ?? 0
      const ascending = a.primaryScoreKind === 'TIME'
      if (av !== bv) return ascending ? av - bv : bv - av
    } else if (a.primaryScoreKind && !b.primaryScoreKind) {
      return -1
    } else if (!a.primaryScoreKind && b.primaryScoreKind) {
      return 1
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

// ─── Movement PR detection ────────────────────────────────────────────────────

// All WorkoutType values that represent strength/lifting work. PR detection
// only runs for these types — conditioning and skill work don't track load PRs.
const STRENGTH_WORKOUT_TYPES = new Set([
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
])

export interface NewPr {
  movementId: string
  movementName: string
  repCount: number
  load: number
  loadUnit: string
  estimatedOneRepMax: number
}

// Epley formula — industry standard for estimating 1RM from multi-rep sets.
// Identity for repCount === 1 so the actual lift is used verbatim.
function epley1RM(load: number, repCount: number): number {
  if (repCount === 1) return load
  return Math.round(load * (1 + repCount / 30))
}

export async function detectAndUpsertStrengthPrs(
  resultId: string,
  value: Prisma.JsonValue,
  workoutType: string,
  userId: string,
): Promise<NewPr[]> {
  if (!STRENGTH_WORKOUT_TYPES.has(workoutType)) return []

  const v = value as { movementResults?: MovementResultEntry[] } | null
  const movementResults = v?.movementResults ?? []
  if (movementResults.length === 0) return []

  // Batch-fetch movement metadata; restrict to STRENGTH category only.
  const movementIds = [...new Set(movementResults.map((mr) => mr.workoutMovementId))]
  const strengthMovements = await prisma.movement.findMany({
    where: { id: { in: movementIds }, category: 'STRENGTH' },
    select: { id: true, name: true },
  })
  const movementNames = new Map(strengthMovements.map((m) => [m.id, m.name]))

  // Find best load per (movementId, repCount) across all sets in this result.
  const candidates = new Map<string, { movementId: string; repCount: number; load: number; loadUnit: string; movementName: string }>()
  for (const mr of movementResults) {
    const movementName = movementNames.get(mr.workoutMovementId)
    if (!movementName) continue
    for (const set of (mr.sets ?? [])) {
      if (!set.reps || set.load === undefined) continue
      const repCount = parseRepsToInt(set.reps)
      if (repCount <= 0) continue
      const key = `${mr.workoutMovementId}::${repCount}`
      const existing = candidates.get(key)
      if (!existing || set.load > existing.load) {
        candidates.set(key, {
          movementId: mr.workoutMovementId,
          repCount,
          load: set.load,
          loadUnit: mr.loadUnit ?? 'LB',
          movementName,
        })
      }
    }
  }

  if (candidates.size === 0) return []

  // Batch-fetch existing PRs for all candidate (movementId, repCount) pairs.
  const existingPrs = await prisma.movementPR.findMany({
    where: {
      userId,
      OR: [...candidates.values()].map(({ movementId, repCount }) => ({ movementId, repCount })),
    },
    select: { movementId: true, repCount: true, load: true },
  })
  const existingByKey = new Map(existingPrs.map((pr) => [`${pr.movementId}::${pr.repCount}`, pr.load]))

  // Upsert only the candidates that beat the current record.
  const newPrs: NewPr[] = []
  await Promise.all(
    [...candidates.values()].map(async (c) => {
      const key = `${c.movementId}::${c.repCount}`
      const existingLoad = existingByKey.get(key)
      if (existingLoad !== undefined && c.load <= existingLoad) return
      await prisma.movementPR.upsert({
        where: { userId_movementId_repCount: { userId, movementId: c.movementId, repCount: c.repCount } },
        create: { userId, movementId: c.movementId, repCount: c.repCount, load: c.load, loadUnit: c.loadUnit as LoadUnit, resultId },
        update: { load: c.load, loadUnit: c.loadUnit as LoadUnit, resultId, achievedAt: new Date() },
      })
      newPrs.push({
        movementId: c.movementId,
        movementName: c.movementName,
        repCount: c.repCount,
        load: c.load,
        loadUnit: c.loadUnit,
        estimatedOneRepMax: epley1RM(c.load, c.repCount),
      })
    }),
  )
  return newPrs
}

export async function findLeaderboardByWorkout(workoutId: string, filters: LeaderboardFilters) {
  const rows = await fetchLeaderboardRows(workoutId, filters)
  if (rows.length === 0) return []
  return sortLeaderboard(rows)
}

export async function updateResultByOwner(
  resultId: string,
  userId: string,
  data: UpdateResultData,
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
  const { page, limit, movementIds, programIds } = pagination
  const skip = (page - 1) * limit
  const movementFilter = movementIds?.length
    ? { workout: { workoutMovements: { some: { movementId: { in: movementIds } } } } }
    : {}
  const programFilter = programIds?.length
    ? { workout: { programId: { in: programIds } } }
    : {}

  const where = { userId, ...movementFilter, ...programFilter }
  const [results, total] = await prisma.$transaction([
    prisma.result.findMany({
      where,
      orderBy: [{ workout: { scheduledAt: 'desc' } }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        workout: { select: { id: true, title: true, type: true, scheduledAt: true } },
      },
    }),
    prisma.result.count({ where }),
  ])

  return { results, total, page, limit, pages: Math.ceil(total / limit) }
}

// ─── Movement history + PR table ──────────────────────────────────────────────

interface SetEntry {
  reps?: string
  load?: number
  seconds?: number
  distance?: number
  calories?: number
}

interface MovementResultEntry {
  workoutMovementId: string
  loadUnit?: string
  distanceUnit?: string
  sets?: SetEntry[]
}

export function extractMovementSets(
  value: Prisma.JsonValue,
  movementId: string,
): { sets: SetEntry[]; loadUnit?: string; distanceUnit?: string } {
  const v = value as { movementResults?: MovementResultEntry[] } | null
  const mr = v?.movementResults?.find((m) => m.workoutMovementId === movementId)
  return { sets: mr?.sets ?? [], loadUnit: mr?.loadUnit, distanceUnit: mr?.distanceUnit }
}

export function parseRepsToInt(reps: string): number {
  return reps.split('.').reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0)
}

type ResultWithWorkout = {
  id: string
  createdAt: Date
  level: WorkoutLevel
  notes: string | null
  value: Prisma.JsonValue
  workout: { id: string; title: string; type: string; scheduledAt: Date }
}

function computeStrengthPrTable(movementId: string, results: ResultWithWorkout[]) {
  const byReps = new Map<number, {
    maxLoad: number; unit: string; workoutId: string; resultId: string; workoutScheduledAt: string
  }>()

  for (const result of results) {
    const { sets, loadUnit } = extractMovementSets(result.value, movementId)
    for (const set of sets) {
      if (!set.reps || set.load === undefined) continue
      const repCount = parseRepsToInt(set.reps)
      if (repCount <= 0 || repCount > 10) continue
      const existing = byReps.get(repCount)
      if (!existing || set.load > existing.maxLoad) {
        byReps.set(repCount, {
          maxLoad: set.load,
          unit: loadUnit ?? 'LB',
          workoutId: result.workout.id,
          resultId: result.id,
          workoutScheduledAt: result.workout.scheduledAt.toISOString(),
        })
      }
    }
  }

  return [...byReps.entries()]
    .map(([reps, data]) => ({ reps, ...data }))
    .sort((a, b) => a.reps - b.reps)
}

function computeEndurancePrTable(movementId: string, results: ResultWithWorkout[]) {
  // Key: `${distance}::${distanceUnit}` — best time per distinct distance+unit combo
  const byDistance = new Map<string, {
    distance: number; distanceUnit: string; bestSeconds: number
    workoutId: string; resultId: string; workoutScheduledAt: string
  }>()

  for (const result of results) {
    const { sets, distanceUnit } = extractMovementSets(result.value, movementId)
    const unit = distanceUnit ?? 'M'
    for (const set of sets) {
      if (set.distance === undefined || !set.seconds) continue
      const key = `${set.distance}::${unit}`
      const existing = byDistance.get(key)
      if (!existing || set.seconds < existing.bestSeconds) {
        byDistance.set(key, {
          distance: set.distance,
          distanceUnit: unit,
          bestSeconds: set.seconds,
          workoutId: result.workout.id,
          resultId: result.id,
          workoutScheduledAt: result.workout.scheduledAt.toISOString(),
        })
      }
    }
  }

  return [...byDistance.values()].sort((a, b) => a.distance - b.distance)
}

function computeMachinePrTable(movementId: string, results: ResultWithWorkout[]) {
  // Output-capped: member targeted a calorie/distance number, seconds varies (best time)
  const calTarget = new Map<number, {
    calories: number; bestSeconds: number
    workoutId: string; resultId: string; workoutScheduledAt: string
  }>()
  const distTarget = new Map<string, {
    distance: number; distanceUnit: string; bestSeconds: number
    workoutId: string; resultId: string; workoutScheduledAt: string
  }>()

  // Time-capped: member had a fixed time window, output varies (best output)
  const timeCapCal = new Map<number, {
    seconds: number; bestCalories: number
    workoutId: string; resultId: string; workoutScheduledAt: string
  }>()
  const timeCapDist = new Map<number, {
    seconds: number; bestDistance: number; distanceUnit: string
    workoutId: string; resultId: string; workoutScheduledAt: string
  }>()

  for (const result of results) {
    const { sets, distanceUnit } = extractMovementSets(result.value, movementId)
    const unit = distanceUnit ?? 'M'

    for (const set of sets) {
      if (set.calories !== undefined && set.seconds) {
        const existing = calTarget.get(set.calories)
        if (!existing || set.seconds < existing.bestSeconds) {
          calTarget.set(set.calories, { calories: set.calories, bestSeconds: set.seconds, workoutId: result.workout.id, resultId: result.id, workoutScheduledAt: result.workout.scheduledAt.toISOString() })
        }
        const existingTime = timeCapCal.get(set.seconds)
        if (!existingTime || set.calories > existingTime.bestCalories) {
          timeCapCal.set(set.seconds, { seconds: set.seconds, bestCalories: set.calories, workoutId: result.workout.id, resultId: result.id, workoutScheduledAt: result.workout.scheduledAt.toISOString() })
        }
      }

      if (set.distance !== undefined && set.seconds) {
        const distKey = `${set.distance}::${unit}`
        const existingDist = distTarget.get(distKey)
        if (!existingDist || set.seconds < existingDist.bestSeconds) {
          distTarget.set(distKey, { distance: set.distance, distanceUnit: unit, bestSeconds: set.seconds, workoutId: result.workout.id, resultId: result.id, workoutScheduledAt: result.workout.scheduledAt.toISOString() })
        }
        const existingTimeDist = timeCapDist.get(set.seconds)
        if (!existingTimeDist || set.distance > existingTimeDist.bestDistance) {
          timeCapDist.set(set.seconds, { seconds: set.seconds, bestDistance: set.distance, distanceUnit: unit, workoutId: result.workout.id, resultId: result.id, workoutScheduledAt: result.workout.scheduledAt.toISOString() })
        }
      }
    }
  }

  return {
    outputCapped: {
      calories: [...calTarget.values()].sort((a, b) => a.calories - b.calories),
      distance: [...distTarget.values()].sort((a, b) => a.distance - b.distance),
    },
    timeCapped: {
      calories: [...timeCapCal.values()].sort((a, b) => a.seconds - b.seconds),
      distance: [...timeCapDist.values()].sort((a, b) => a.seconds - b.seconds),
    },
  }
}

function buildPrTable(category: MovementCategory, movementId: string, results: ResultWithWorkout[]) {
  switch (category) {
    case 'STRENGTH':
      return { category, entries: computeStrengthPrTable(movementId, results) }
    case 'ENDURANCE':
      return { category, entries: computeEndurancePrTable(movementId, results) }
    case 'MACHINE':
      return { category, ...computeMachinePrTable(movementId, results) }
    default:
      return { category, entries: [] as never[] }
  }
}

export async function findMovementPrAndHistoryForUser(
  userId: string,
  movementId: string,
  pagination: { page: number; limit: number },
) {
  const movement = await prisma.movement.findUnique({
    where: { id: movementId },
    select: { id: true, name: true, category: true },
  })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })

  const allResults = await prisma.result.findMany({
    where: {
      userId,
      workout: { workoutMovements: { some: { movementId } } },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      workout: { select: { id: true, title: true, type: true, scheduledAt: true } },
    },
  })

  const total = allResults.length
  const { page, limit } = pagination
  const pageResults = allResults.slice((page - 1) * limit, page * limit)

  const prTable = buildPrTable(movement.category, movementId, allResults)

  const displayResults = pageResults.map((r) => {
    const { sets, loadUnit, distanceUnit } = extractMovementSets(r.value, movementId)
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      level: r.level,
      notes: r.notes,
      workout: {
        id: r.workout.id,
        title: r.workout.title,
        type: r.workout.type,
        scheduledAt: r.workout.scheduledAt.toISOString(),
      },
      movementSets: sets,
      loadUnit,
      distanceUnit,
    }
  })

  return {
    movementId: movement.id,
    movementName: movement.name,
    category: movement.category,
    prTable,
    results: displayResults,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }
}
