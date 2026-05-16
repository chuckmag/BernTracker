import { prisma } from '../client.js'
import type { WorkoutLevel, WorkoutGender } from '../client.js'

export async function createBenchmarkResult(data: {
  userId: string
  namedWorkoutName: string
  achievedAt: Date
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: object
  notes?: string
  primaryScoreKind?: string
  primaryScoreValue?: number
}) {
  return prisma.benchmarkResult.create({ data })
}

export async function findBenchmarkResultsForUser(userId: string, namedWorkoutName: string) {
  return prisma.benchmarkResult.findMany({
    where: { userId, namedWorkoutName },
    orderBy: { achievedAt: 'desc' },
  })
}

export async function updateBenchmarkResult(
  id: string,
  userId: string,
  data: {
    achievedAt?: Date
    level?: WorkoutLevel
    workoutGender?: WorkoutGender
    value?: object
    notes?: string
    primaryScoreKind?: string
    primaryScoreValue?: number
  },
) {
  return prisma.benchmarkResult.update({
    where: { id, userId },
    data,
  })
}

export async function deleteBenchmarkResult(id: string, userId: string) {
  return prisma.benchmarkResult.delete({ where: { id, userId } })
}

export async function findAllBenchmarkResultsForUser(userId: string) {
  return prisma.benchmarkResult.findMany({
    where: { userId },
    orderBy: { achievedAt: 'desc' },
  })
}

export async function findResultsByUserForNamedWorkout(userId: string, namedWorkoutId: string) {
  return prisma.result.findMany({
    where: { userId, workout: { namedWorkoutId } },
    include: { workout: { select: { id: true, scheduledAt: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

// Returns all active NamedWorkouts annotated with the user's manual result count
// and most recent BenchmarkResult. Suitable for list views and MCP consumption.
export async function findBenchmarkSummaryForUser(userId: string) {
  const [namedWorkouts, allResults] = await Promise.all([
    prisma.namedWorkout.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.benchmarkResult.findMany({ where: { userId }, orderBy: { achievedAt: 'desc' } }),
  ])

  const resultsByName = new Map<string, (typeof allResults)[number][]>()
  for (const r of allResults) {
    const bucket = resultsByName.get(r.namedWorkoutName) ?? []
    bucket.push(r)
    resultsByName.set(r.namedWorkoutName, bucket)
  }

  return namedWorkouts.map((nw) => ({
    ...nw,
    manualResultCount: resultsByName.get(nw.name)?.length ?? 0,
    latestResult: resultsByName.get(nw.name)?.[0] ?? null,
  }))
}

// Returns a NamedWorkout with its full merged result history for a user —
// BenchmarkResult (manual entries) plus Result (programmed workouts) —
// sorted by achievedAt descending. Returns null when the NamedWorkout doesn't exist.
export async function findBenchmarkHistoryForUser(userId: string, namedWorkoutId: string) {
  const namedWorkout = await prisma.namedWorkout.findUnique({ where: { id: namedWorkoutId } })
  if (!namedWorkout) return null

  const [manualResults, programmedResults] = await Promise.all([
    prisma.benchmarkResult.findMany({
      where: { userId, namedWorkoutName: namedWorkout.name },
      orderBy: { achievedAt: 'desc' },
    }),
    prisma.result.findMany({
      where: { userId, workout: { namedWorkoutId } },
      include: { workout: { select: { id: true, scheduledAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const history = [
    ...manualResults.map((r) => ({
      source: 'manual' as const,
      id: r.id,
      achievedAt: r.achievedAt,
      level: r.level,
      workoutGender: r.workoutGender,
      value: r.value,
      notes: r.notes,
      primaryScoreKind: r.primaryScoreKind,
      primaryScoreValue: r.primaryScoreValue,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    ...programmedResults.map((r) => ({
      source: 'programmed' as const,
      id: r.id,
      achievedAt: r.workout.scheduledAt,
      level: r.level,
      workoutGender: r.workoutGender,
      value: r.value,
      notes: r.notes,
      primaryScoreKind: r.primaryScoreKind,
      primaryScoreValue: r.primaryScoreValue,
      workoutId: r.workoutId,
      workoutScheduledAt: r.workout.scheduledAt,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())

  return { namedWorkout, history }
}
