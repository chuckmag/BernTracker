/**
 * WODalytics admin surface (#160). Curates unaffiliated/public-catalog
 * programs (e.g. the CrossFit Mainsite ingest) without granting access to any
 * gym-scoped data. Slice 2 added read-only endpoints; slice 3 (this file's
 * mutating handlers) lets admins author programs and workouts directly.
 *
 * Every route is gated by `requireAuth + requireWodalyticsAdmin`. Empty /
 * unset `WODALYTICS_ADMIN_EMAILS` → 403 (deny by default).
 *
 * **Auth boundary:** every mutation re-checks that its target program is in
 * the public catalog (`gyms: { none: {} }, ownerUserId: null`). Without that
 * check an admin could PATCH a gym-scoped or Personal Program through the
 * admin path, which would muddle two separate auth surfaces. The check
 * lives in `findUnaffiliatedProgramById` / `findUnaffiliatedProgramByIdWithCounts`
 * — both return null for anything that isn't admin-curatable.
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth, requireWodalyticsAdmin } from '../middleware/auth.js'
import {
  CreateProgramSchema,
  UpdateProgramSchema,
  CreateWorkoutSchema,
  UpdateWorkoutSchema,
} from '@wodalytics/types'
import {
  findAllUnaffiliatedPrograms,
  findUnaffiliatedProgramById,
  findUnaffiliatedProgramByIdWithCounts,
  createUnaffiliatedProgram,
  updateProgramById,
  deleteProgramById,
} from '../db/programDbManager.js'
import {
  createWorkoutForProgram,
  findWorkoutById,
  findWorkoutsByProgramId,
  updateWorkout,
  publishWorkoutById,
  deleteWorkout,
} from '../db/workoutDbManager.js'

const router = Router()

const adminGuards = [requireAuth, requireWodalyticsAdmin] as const

// ─── Routes ───────────────────────────────────────────────────────────────────

// Read (slice 2)
router.get('/admin/programs', ...adminGuards, listAdminPrograms)
router.get('/admin/programs/:id', ...adminGuards, getAdminProgramById)
router.get('/admin/programs/:id/workouts', ...adminGuards, listAdminProgramWorkouts)

// Mutations (slice 3)
router.post('/admin/programs', ...adminGuards, createAdminProgram)
router.patch('/admin/programs/:id', ...adminGuards, updateAdminProgram)
router.delete('/admin/programs/:id', ...adminGuards, deleteAdminProgram)
router.post('/admin/programs/:id/workouts', ...adminGuards, createAdminWorkout)
router.patch('/admin/workouts/:id', ...adminGuards, updateAdminWorkout)
router.post('/admin/workouts/:id/publish', ...adminGuards, publishAdminWorkout)
router.delete('/admin/workouts/:id', ...adminGuards, deleteAdminWorkout)

export default router

// ─── Helpers ──────────────────────────────────────────────────────────────────

function badRequestFromZod(err: { issues: { path: (string | number)[]; message: string }[] }, res: Response) {
  const issue = err.issues[0]
  const field = issue?.path[0] ?? 'request'
  const message = issue?.message ?? 'Invalid request'
  res.status(400).json({ error: `${field}: ${message}` })
}

// ─── Read handlers (slice 2 — unchanged) ──────────────────────────────────────

async function listAdminPrograms(_req: Request, res: Response) {
  const programs = await findAllUnaffiliatedPrograms()
  res.json(programs)
}

async function getAdminProgramById(req: Request, res: Response) {
  const id = req.params.id as string
  const program = await findUnaffiliatedProgramByIdWithCounts(id)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  res.json(program)
}

async function listAdminProgramWorkouts(req: Request, res: Response) {
  const id = req.params.id as string
  const program = await findUnaffiliatedProgramByIdWithCounts(id)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  const workouts = await findWorkoutsByProgramId(id)
  res.json(workouts)
}

// ─── Program mutations ────────────────────────────────────────────────────────

async function createAdminProgram(req: Request, res: Response) {
  const parsed = CreateProgramSchema.safeParse(req.body)
  if (!parsed.success) return badRequestFromZod(parsed.error, res)
  const data = parsed.data
  const program = await createUnaffiliatedProgram({
    name: data.name,
    description: data.description ?? null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    coverColor: data.coverColor ?? null,
    visibility: data.visibility,
  })
  res.status(201).json(program)
}

async function updateAdminProgram(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findUnaffiliatedProgramById(id)
  if (!existing) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  const parsed = UpdateProgramSchema.safeParse(req.body)
  if (!parsed.success) return badRequestFromZod(parsed.error, res)
  const d = parsed.data
  const updated = await updateProgramById(id, {
    name: d.name,
    description: d.description,
    startDate: d.startDate ? new Date(d.startDate) : undefined,
    endDate: d.endDate === null ? null : d.endDate ? new Date(d.endDate) : undefined,
    coverColor: d.coverColor,
    visibility: d.visibility,
  })
  res.json(updated)
}

async function deleteAdminProgram(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findUnaffiliatedProgramById(id)
  if (!existing) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  await deleteProgramById(id)
  res.status(204).send()
}

// ─── Workout mutations ────────────────────────────────────────────────────────

async function createAdminWorkout(req: Request, res: Response) {
  const programId = req.params.id as string
  const program = await findUnaffiliatedProgramById(programId)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  const parsed = CreateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) return badRequestFromZod(parsed.error, res)
  const d = parsed.data
  // URL programId is authoritative — body's optional programId is ignored to
  // keep the URL as the single source of truth for which program a workout
  // belongs to. Status defaults to DRAFT (schema default), matching the gym
  // create flow — admins use the same Save-as-Draft / Publish split the
  // gym staff use, via the shared `WorkoutDrawer`.
  const workout = await createWorkoutForProgram({
    programId,
    title: d.title,
    description: d.description,
    coachNotes: d.coachNotes === '' ? null : d.coachNotes,
    type: d.type,
    scheduledAt: new Date(d.scheduledAt),
    dayOrder: d.dayOrder,
    movementIds: d.movementIds,
    movements: d.movements,
    namedWorkoutId: d.namedWorkoutId,
    timeCapSeconds: d.timeCapSeconds,
    tracksRounds: d.tracksRounds,
  })
  res.status(201).json(workout)
}

async function updateAdminWorkout(req: Request, res: Response) {
  const workoutId = req.params.id as string
  const existing = await findWorkoutById(workoutId)
  if (!existing) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  // Verify the workout's program is in the admin catalog. Without this an
  // admin could PATCH a gym-scoped workout via the admin path.
  if (!existing.programId || !(await findUnaffiliatedProgramById(existing.programId))) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  const parsed = UpdateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) return badRequestFromZod(parsed.error, res)
  const d = parsed.data
  const updated = await updateWorkout(workoutId, {
    title: d.title,
    description: d.description,
    coachNotes: d.coachNotes === '' ? null : d.coachNotes,
    type: d.type,
    scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : undefined,
    dayOrder: d.dayOrder,
    movementIds: d.movementIds,
    movements: d.movements,
    namedWorkoutId: d.namedWorkoutId,
    timeCapSeconds: d.timeCapSeconds,
    tracksRounds: d.tracksRounds,
  })
  res.json(updated)
}

async function publishAdminWorkout(req: Request, res: Response) {
  const workoutId = req.params.id as string
  const existing = await findWorkoutById(workoutId)
  if (!existing) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!existing.programId || !(await findUnaffiliatedProgramById(existing.programId))) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  const workout = await publishWorkoutById(workoutId)
  res.json(workout)
}

async function deleteAdminWorkout(req: Request, res: Response) {
  const workoutId = req.params.id as string
  const existing = await findWorkoutById(workoutId)
  if (!existing) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!existing.programId || !(await findUnaffiliatedProgramById(existing.programId))) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  await deleteWorkout(workoutId)
  res.status(204).send()
}
