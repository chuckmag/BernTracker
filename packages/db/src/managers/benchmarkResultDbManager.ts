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
