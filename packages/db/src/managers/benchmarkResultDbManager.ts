import { prisma } from '../client.js'
import type { WorkoutLevel, WorkoutGender } from '../client.js'

export async function createBenchmarkResult(data: {
  userId: string
  namedWorkoutId: string
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

export async function findBenchmarkResultsForUser(userId: string, namedWorkoutId: string) {
  return prisma.benchmarkResult.findMany({
    where: { userId, namedWorkoutId },
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
