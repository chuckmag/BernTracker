import { prisma } from '@berntracker/db'
import type { WorkoutType } from '@berntracker/db'

interface CreateWorkoutData {
  programId?: string
  title: string
  description: string
  type: WorkoutType
  scheduledAt: Date
}

interface UpdateWorkoutData {
  title?: string
  description?: string
  type?: WorkoutType
  scheduledAt?: Date
}

export async function createWorkoutForProgram(data: CreateWorkoutData) {
  return prisma.workout.create({ data })
}

export async function findWorkoutsByGymAndDateRange(gymId: string, from: Date, to: Date) {
  return prisma.workout.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      program: { gyms: { some: { gymId } } },
    },
    orderBy: { scheduledAt: 'asc' },
    include: { _count: { select: { results: true } } },
  })
}

export async function findWorkoutById(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    include: { _count: { select: { results: true } } },
  })
}

export async function updateWorkout(id: string, data: UpdateWorkoutData) {
  return prisma.workout.update({ where: { id }, data })
}

export async function publishWorkout(id: string) {
  return prisma.workout.update({ where: { id }, data: { status: 'PUBLISHED' } })
}

export async function deleteWorkout(id: string) {
  return prisma.workout.delete({ where: { id } })
}
