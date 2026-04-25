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
  movementIds?: string[]
  namedWorkoutId?: string
  // External ingest jobs (e.g. CrossFit Mainsite cron) set these. The unique
  // constraint on externalSourceId makes the upsert path idempotent.
  externalSourceId?: string
  status?: WorkoutStatus
}

interface UpdateWorkoutData {
  title?: string
  description?: string
  type?: WorkoutType
  scheduledAt?: Date
  dayOrder?: number
  movementIds?: string[]
  namedWorkoutId?: string | null
}

interface WorkoutDateRangeFilters {
  publishedOnly?: boolean
  movementIds?: string[]
  programId?: string
}

const programSelect = { select: { id: true, name: true } } as const
const namedWorkoutSelect = { select: { id: true, name: true, category: true } } as const
const workoutMovementsInclude = {
  workoutMovements: {
    include: { movement: { select: { id: true, name: true, parentId: true } } },
  },
} as const


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
  const { movementIds, ...rest } = data
  return prisma.workout.create({
    data: {
      ...rest,
      ...(movementIds?.length
        ? { workoutMovements: { create: movementIds.map((id) => ({ movementId: id })) } }
        : {}),
    },
    include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
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
      ...(filters.movementIds?.length
        ? { workoutMovements: { some: { movementId: { in: filters.movementIds } } } }
        : {}),
      ...(filters.programId ? { programId: filters.programId } : {}),
    },
    // createdAt is a stable tiebreaker for equal dayOrder values (e.g. pre-migration rows defaulted to 0)
    orderBy: [{ scheduledAt: 'asc' }, { dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      program: programSelect,
      namedWorkout: namedWorkoutSelect,
      _count: { select: { results: true } },
      ...workoutMovementsInclude,
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
      namedWorkout: namedWorkoutSelect,
      _count: { select: { results: true } },
      ...workoutMovementsInclude,
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

export async function findWorkoutByExternalSourceId(externalSourceId: string) {
  return prisma.workout.findUnique({ where: { externalSourceId } })
}

export async function updateWorkout(id: string, data: UpdateWorkoutData) {
  const { movementIds, ...rest } = data

  if (movementIds === undefined) {
    return prisma.workout.update({
      where: { id },
      data: rest,
      include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
    })
  }

  return prisma.$transaction(async (tx) => {
    await tx.workoutMovement.deleteMany({ where: { workoutId: id } })
    if (movementIds.length > 0) {
      await tx.workoutMovement.createMany({
        data: movementIds.map((movementId) => ({ workoutId: id, movementId })),
      })
    }
    return tx.workout.update({
      where: { id },
      data: rest,
      include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
    })
  })
}

export async function publishWorkoutById(id: string) {
  return prisma.workout.update({
    where: { id },
    data: { status: WorkoutStatus.PUBLISHED },
    include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
  })
}

export async function applyTemplateToWorkout(workoutId: string) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { namedWorkoutId: true },
  })
  if (!workout?.namedWorkoutId) {
    throw Object.assign(new Error('Workout has no named workout set'), { statusCode: 400 })
  }

  const namedWorkout = await prisma.namedWorkout.findUnique({
    where: { id: workout.namedWorkoutId },
    include: {
      templateWorkout: {
        select: {
          type: true,
          description: true,
          workoutMovements: { select: { movementId: true } },
        },
      },
    },
  })
  if (!namedWorkout?.templateWorkout) {
    throw Object.assign(new Error('Named workout has no template'), { statusCode: 400 })
  }

  const { type, description, workoutMovements } = namedWorkout.templateWorkout
  const movementIds = workoutMovements.map((wm) => wm.movementId)

  await prisma.workoutMovement.deleteMany({ where: { workoutId } })
  if (movementIds.length > 0) {
    await prisma.workoutMovement.createMany({
      data: movementIds.map((movementId) => ({ workoutId, movementId })),
    })
  }
  return prisma.workout.update({
    where: { id: workoutId },
    data: { type, description },
    include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
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
