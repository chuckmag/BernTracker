import { prisma } from '@berntracker/db'
import { WorkoutStatus } from '@berntracker/db'
import type { WorkoutType } from '@berntracker/db'

interface CreateWorkoutData {
  programId?: string
  title: string
  description: string
  type: WorkoutType
  scheduledAt: Date
  dayOrder?: number
}

interface UpdateWorkoutData {
  title?: string
  description?: string
  type?: WorkoutType
  scheduledAt?: Date
  dayOrder?: number
}

interface WorkoutDateRangeFilters {
  publishedOnly?: boolean
}

const programSelect = { select: { id: true, name: true } } as const


export async function countWorkoutsOnSameDay(gymId: string, scheduledAt: Date): Promise<number> {
  const dayStart = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate()))
  const dayEnd = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate() + 1) - 1)
  return prisma.workout.count({
    where: {
      scheduledAt: { gte: dayStart, lte: dayEnd },
      program: { gyms: { some: { gymId } } },
    },
  })
}

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
  const workouts = await prisma.workout.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      program: { gyms: { some: { gymId } } },
      ...(filters.publishedOnly ? { status: WorkoutStatus.PUBLISHED } : {}),
    },
    // createdAt is a stable tiebreaker for equal dayOrder values (e.g. pre-migration rows defaulted to 0)
    orderBy: [{ scheduledAt: 'asc' }, { dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      program: programSelect,
      _count: { select: { results: true } },
    },
  })

  // Detect duplicate dayOrder values within a day and normalize to 0-based
  // sequential integers in place. Persists corrections asynchronously so
  // subsequent reads are already clean.
  const byDay = new Map<string, typeof workouts>()
  for (const w of workouts) {
    const key = w.scheduledAt.toISOString().slice(0, 10)
    const group = byDay.get(key) ?? []
    group.push(w)
    byDay.set(key, group)
  }

  const updates: Promise<unknown>[] = []
  for (const group of byDay.values()) {
    const orders = group.map((w) => w.dayOrder)
    if (orders.length !== new Set(orders).size) {
      group.forEach((w, idx) => {
        if (w.dayOrder !== idx) {
          w.dayOrder = idx
          updates.push(prisma.workout.update({ where: { id: w.id }, data: { dayOrder: idx } }))
        }
      })
    }
  }

  if (updates.length > 0) await Promise.all(updates)

  return workouts
}

export async function findWorkoutById(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    include: {
      program: programSelect,
      _count: { select: { results: true } },
    },
  })
}

// Lightweight query for auth middleware — returns only programId
export async function findWorkoutProgramId(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    select: { programId: true },
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


export async function deleteWorkout(id: string) {
  return prisma.workout.delete({ where: { id } })
}
