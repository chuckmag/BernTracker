import { prisma } from '@berntracker/db'
import { WorkoutStatus } from '@berntracker/db'
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

interface WorkoutDateRangeFilters {
  publishedOnly?: boolean
}

const programSelect = { select: { id: true, name: true } } as const

const programWithGymIdsSelect = {
  select: { id: true, name: true, gyms: { select: { gymId: true } } },
} as const

export async function createWorkoutForProgram(data: CreateWorkoutData) {
  return prisma.workout.create({
    data,
    include: { program: programSelect },
  })
}

export async function findWorkoutsByGymAndDateRange(
  gymId: string,
  from: Date,
  to: Date,
  filters: WorkoutDateRangeFilters = {},
) {
  return prisma.workout.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      program: { gyms: { some: { gymId } } },
      ...(filters.publishedOnly ? { status: WorkoutStatus.PUBLISHED } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    include: {
      program: programSelect,
      _count: { select: { results: true } },
    },
  })
}

export async function findWorkoutById(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    include: {
      program: programWithGymIdsSelect,
      _count: { select: { results: true } },
    },
  })
}

export async function updateWorkout(id: string, data: UpdateWorkoutData) {
  return prisma.workout.update({
    where: { id },
    data,
    include: { program: programSelect },
  })
}

export async function publishWorkoutById(id: string) {
  return prisma.workout.update({
    where: { id },
    data: { status: WorkoutStatus.PUBLISHED },
    include: { program: programSelect },
  })
}

export async function publishWorkoutsByGymAndDateRange(gymId: string, from: Date, to: Date) {
  return prisma.workout.updateMany({
    where: {
      status: WorkoutStatus.DRAFT,
      scheduledAt: { gte: from, lte: to },
      program: { gyms: { some: { gymId } } },
    },
    data: { status: WorkoutStatus.PUBLISHED },
  })
}

// Lightweight query for auth middleware — returns only gym IDs, not full workout data
export async function findWorkoutGymIdsById(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    select: { program: { select: { gyms: { select: { gymId: true } } } } },
  })
}

export async function deleteWorkout(id: string) {
  return prisma.workout.delete({ where: { id } })
}
