import { prisma } from '@wodalytics/db'
import { WorkoutStatus } from '@wodalytics/db'
import type { WorkoutType, LoadUnit, DistanceUnit } from '@wodalytics/db'

// Per-movement prescription. Only `movementId` is required; every other
// column is optional and only filled in when the programmer wants to track
// that axis. `displayOrder` defaults to the index in the array when omitted.
export interface MovementPrescriptionInput {
  movementId: string
  displayOrder?: number
  sets?: number
  reps?: string
  load?: number
  loadUnit?: LoadUnit
  tracksLoad?: boolean
  tempo?: string
  distance?: number
  distanceUnit?: DistanceUnit
  calories?: number
  seconds?: number
}

interface CreateWorkoutData {
  programId?: string
  title: string
  description: string
  type: WorkoutType
  scheduledAt: Date
  dayOrder?: number
  movementIds?: string[]
  movements?: MovementPrescriptionInput[]
  namedWorkoutId?: string
  timeCapSeconds?: number | null
  tracksRounds?: boolean
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
  movements?: MovementPrescriptionInput[]
  namedWorkoutId?: string | null
  timeCapSeconds?: number | null
  tracksRounds?: boolean
}

// Bare-id legacy callers upcast to a prescription with only `movementId`
// populated. New callers pass `movements` directly.
function toPrescriptionList(
  movementIds: string[] | undefined,
  movements: MovementPrescriptionInput[] | undefined,
): MovementPrescriptionInput[] | undefined {
  if (movements !== undefined) return movements
  if (movementIds !== undefined) return movementIds.map((id) => ({ movementId: id }))
  return undefined
}

function prescriptionToCreateRow(p: MovementPrescriptionInput, fallbackOrder: number) {
  return {
    movementId:   p.movementId,
    displayOrder: p.displayOrder ?? fallbackOrder,
    sets:         p.sets ?? null,
    reps:         p.reps ?? null,
    load:         p.load ?? null,
    loadUnit:     p.loadUnit ?? null,
    // Default true at the API boundary so legacy clients that don't yet
    // send the field land in the most-common-case state.
    tracksLoad:   p.tracksLoad ?? true,
    tempo:        p.tempo ?? null,
    distance:     p.distance ?? null,
    distanceUnit: p.distanceUnit ?? null,
    calories:     p.calories ?? null,
    seconds:      p.seconds ?? null,
  }
}

interface WorkoutDateRangeFilters {
  publishedOnly?: boolean
  movementIds?: string[]
  programIds?: string[]
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
  const { movementIds, movements, ...rest } = data
  const prescriptions = toPrescriptionList(movementIds, movements)
  return prisma.workout.create({
    data: {
      ...rest,
      ...(prescriptions?.length
        ? { workoutMovements: { create: prescriptions.map((p, i) => prescriptionToCreateRow(p, i)) } }
        : {}),
    },
    include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
  })
}

export async function findWorkoutsByGymAndDateRange(
  gymId: string,
  from: Date,
  to: Date,
  viewerUserId: string,
  filters: WorkoutDateRangeFilters = {},
) {
  // When the caller pins specific programIds the route layer has already
  // run visibility-aware access checks per id (including allowing unaffiliated
  // programs the caller subscribes to). Drop the gym-scoping constraint in
  // that case so workouts under unaffiliated programs come back instead of
  // silently filtering to the empty set.
  const gymScope = filters.programIds?.length
    ? {}
    : { program: { gyms: { some: { gymId } } } }

  const workouts = await prisma.workout.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      ...gymScope,
      ...(filters.publishedOnly ? { status: WorkoutStatus.PUBLISHED } : {}),
      ...(filters.movementIds?.length
        ? { workoutMovements: { some: { movementId: { in: filters.movementIds } } } }
        : {}),
      ...(filters.programIds?.length ? { programId: { in: filters.programIds } } : {}),
    },
    // createdAt is a stable tiebreaker for equal dayOrder values (e.g. pre-migration rows defaulted to 0)
    orderBy: [{ scheduledAt: 'asc' }, { dayOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      program: programSelect,
      namedWorkout: namedWorkoutSelect,
      _count: { select: { results: true } },
      // Viewer's own result on this workout (0 or 1 row — Result is unique by
      // (userId, workoutId)). Surfaced to the feed tile as `myResultId` so the
      // UI can show a "you logged" indicator without an N+1 fetch per tile.
      results: { where: { userId: viewerUserId }, select: { id: true } },
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

  // Reshape `results` (an array of 0–1 ids filtered to the viewer) into a
  // simple scalar `myResultId` field. The raw array is an internal shape that
  // shouldn't leak to the API client.
  return workouts.map(({ results, ...rest }) => ({
    ...rest,
    myResultId: results[0]?.id ?? null,
  }))
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

// Lightweight query for auth middleware — returns the workout's programId plus
// the program's linked gymIds (empty array when the program is unaffiliated,
// e.g. the public CrossFit Mainsite program created by the ingest job).
export async function findWorkoutWithProgramGyms(id: string) {
  return prisma.workout.findUnique({
    where: { id },
    select: {
      programId: true,
      program: { select: { gyms: { select: { gymId: true } } } },
    },
  })
}

export async function findWorkoutByExternalSourceId(externalSourceId: string) {
  return prisma.workout.findUnique({ where: { externalSourceId } })
}

export async function countWorkoutsByProgramId(programId: string): Promise<number> {
  return prisma.workout.count({ where: { programId } })
}

export async function updateWorkout(id: string, data: UpdateWorkoutData) {
  const { movementIds, movements, ...rest } = data
  const prescriptions = toPrescriptionList(movementIds, movements)

  if (prescriptions === undefined) {
    return prisma.workout.update({
      where: { id },
      data: rest,
      include: { program: programSelect, namedWorkout: namedWorkoutSelect, ...workoutMovementsInclude },
    })
  }

  return prisma.$transaction(async (tx) => {
    await tx.workoutMovement.deleteMany({ where: { workoutId: id } })
    if (prescriptions.length > 0) {
      await tx.workoutMovement.createMany({
        data: prescriptions.map((p, i) => ({ workoutId: id, ...prescriptionToCreateRow(p, i) })),
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
