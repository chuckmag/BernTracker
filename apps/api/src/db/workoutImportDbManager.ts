import { prisma, Prisma, WorkoutImportStatus, WorkoutStatus } from '@wodalytics/db'
import type { WorkoutType } from '@wodalytics/db'

// DB layer for slice 6 / #89 — bulk workout uploads. Stores parsed previews,
// creates draft workouts on confirmation, and bulk-publishes drafts on the
// programmer's command.

interface CreateImportData {
  programId: string
  uploadedBy: string
  filename: string
  rowCount: number
  parsedJson: Prisma.InputJsonValue | null
  errorJson: Prisma.InputJsonValue | null
  status: WorkoutImportStatus
}

export async function createWorkoutImport(data: CreateImportData) {
  // Prisma's JSON-null sentinel is needed for nullable Json columns; passing
  // a literal `null` is rejected by the generated types.
  return prisma.workoutImport.create({
    data: {
      programId: data.programId,
      uploadedBy: data.uploadedBy,
      filename: data.filename,
      rowCount: data.rowCount,
      status: data.status,
      parsedJson: data.parsedJson ?? Prisma.JsonNull,
      errorJson: data.errorJson ?? Prisma.JsonNull,
    },
  })
}

export async function findWorkoutImportByIdAndProgramId(importId: string, programId: string) {
  return prisma.workoutImport.findFirst({
    where: { id: importId, programId },
  })
}

export async function findWorkoutImportsByProgramId(programId: string) {
  return prisma.workoutImport.findMany({
    where: { programId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function markWorkoutImportFailed(importId: string, errorJson: Prisma.InputJsonValue) {
  return prisma.workoutImport.update({
    where: { id: importId },
    data: { status: WorkoutImportStatus.FAILED, errorJson },
  })
}

interface DraftWorkoutInput {
  title: string
  description: string
  type: WorkoutType
  scheduledAt: Date
  dayOrder: number
  namedWorkoutId: string | null
}

interface CreateDraftsResult {
  createdCount: number
  workoutIds: string[]
}

/**
 * Atomically materializes parsed rows into Workout rows for the given
 * import. All workouts created have `status=DRAFT`, `programId=<programId>`,
 * and `importId=<importId>` so the bulk-publish step can scope precisely.
 *
 * Wrapped in a transaction so a partial failure (e.g. unique-constraint
 * collision) rolls back every Workout written for this import — the user
 * either gets all the drafts or none of them.
 */
export async function createDraftWorkoutsFromImport(
  programId: string,
  importId: string,
  workouts: DraftWorkoutInput[],
): Promise<CreateDraftsResult> {
  const result = await prisma.$transaction(async (tx) => {
    const workoutIds: string[] = []
    for (const w of workouts) {
      const created = await tx.workout.create({
        data: {
          programId,
          importId,
          title: w.title,
          description: w.description,
          type: w.type,
          scheduledAt: w.scheduledAt,
          dayOrder: w.dayOrder,
          namedWorkoutId: w.namedWorkoutId ?? undefined,
          status: WorkoutStatus.DRAFT,
        },
        select: { id: true },
      })
      workoutIds.push(created.id)
    }
    await tx.workoutImport.update({
      where: { id: importId },
      data: {
        status: WorkoutImportStatus.DRAFT,
        createdCount: workoutIds.length,
        skippedCount: 0,
      },
    })
    return { createdCount: workoutIds.length, workoutIds }
  })
  return result
}

interface PublishDraftsResult {
  publishedCount: number
  skippedCount: number
}

/**
 * Bulk-publishes every Workout linked to this import that is currently
 * DRAFT. Already-PUBLISHED rows are silently skipped (no error) and
 * counted in `skippedCount` so the UI can show "12 published, 1 already
 * published". Wrapped in a transaction so the import row's status flip
 * stays consistent with the workout updates.
 */
export async function publishDraftWorkoutsForImport(importId: string): Promise<PublishDraftsResult> {
  return prisma.$transaction(async (tx) => {
    const drafts = await tx.workout.findMany({
      where: { importId, status: WorkoutStatus.DRAFT },
      select: { id: true },
    })
    const all = await tx.workout.count({ where: { importId } })
    if (drafts.length > 0) {
      await tx.workout.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { status: WorkoutStatus.PUBLISHED },
      })
    }
    await tx.workoutImport.update({
      where: { id: importId },
      data: { status: WorkoutImportStatus.PUBLISHED },
    })
    return { publishedCount: drafts.length, skippedCount: all - drafts.length }
  })
}

/**
 * For idempotency on re-upload — finds existing workouts in this program
 * that match (scheduledAt, dayOrder) so the parser layer can flag them as
 * collisions in the preview.
 */
export async function findCollisionsForProgram(
  programId: string,
  candidates: { scheduledAt: Date; dayOrder: number }[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set()
  // Build a key set for the candidates and load any matching Workouts.
  const dates = Array.from(new Set(candidates.map((c) => c.scheduledAt.toISOString())))
  const existing = await prisma.workout.findMany({
    where: {
      programId,
      scheduledAt: { in: dates.map((d) => new Date(d)) },
    },
    select: { scheduledAt: true, dayOrder: true },
  })
  const set = new Set<string>()
  for (const e of existing) set.add(`${e.scheduledAt.toISOString()}|${e.dayOrder}`)
  return set
}
