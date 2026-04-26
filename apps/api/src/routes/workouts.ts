import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  validateGymExists,
  requireGymMembership,
  requireGymWriteAccess,
  requireWorkoutProgramMembership,
  requireWorkoutProgramWriteAccess,
} from '../middleware/gym.js'
import {
  createWorkoutForProgram as createWorkoutForProgramDb,
  countWorkoutsOnSameDay,
  findWorkoutsByGymAndDateRange,
  findWorkoutById,
  updateWorkout,
  publishWorkoutById,
  publishWorkoutsByGymAndDateRange,
  deleteWorkout,
  applyTemplateToWorkout,
} from '../db/workoutDbManager.js'
import { expandMovementIdsWithVariations } from '../db/movementDbManager.js'
import {
  findGymMembershipByUserAndGym
} from '../db/userGymDbManager.js'
import { CreateWorkoutSchema, UpdateWorkoutSchema } from '@wodalytics/types'
import { Role } from '@wodalytics/db'

const router = Router()

const gymGuards = [requireAuth, validateGymExists, requireGymMembership] as const

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/gyms/:gymId/workouts?from=&to=
router.get('/gyms/:gymId/workouts', ...gymGuards, getWorkoutsByGymAndDateRange)

// POST /api/gyms/:gymId/workouts
router.post('/gyms/:gymId/workouts', requireAuth, validateGymExists, requireGymWriteAccess, createWorkoutForProgram)

// POST /api/gyms/:gymId/workouts/publish — batch publish by date range
router.post('/gyms/:gymId/workouts/publish', requireAuth, validateGymExists, requireGymWriteAccess, batchPublishWorkoutsForGym)

// GET  /api/workouts/:id
router.get('/workouts/:id', requireAuth, requireWorkoutProgramMembership, getWorkoutById)

// PATCH /api/workouts/:id
router.patch('/workouts/:id', requireAuth, requireWorkoutProgramWriteAccess, patchWorkout)

// POST /api/workouts/:id/publish
router.post('/workouts/:id/publish', requireAuth, requireWorkoutProgramWriteAccess, publishSingleWorkout)

// POST /api/workouts/:id/apply-template
router.post('/workouts/:id/apply-template', requireAuth, requireWorkoutProgramWriteAccess, applyTemplate)

// DELETE /api/workouts/:id
router.delete('/workouts/:id', requireAuth, requireWorkoutProgramWriteAccess, deleteWorkoutById)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function getWorkoutsByGymAndDateRange(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const from = req.query.from as string | undefined
  const to = req.query.to as string | undefined
  if (!from || !to) return res.status(400).json({ error: 'Query params from and to are required' })

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format for from or to' })
  }


  const membership = await findGymMembershipByUserAndGym(req.user!.id, gymId)
  const publishedOnly = membership?.role === Role.MEMBER

  const rawMovementIds = req.query.movementIds
  const movementIdList = rawMovementIds ? String(rawMovementIds).split(',').filter(Boolean) : []
  const movementIds = movementIdList.length
    ? await expandMovementIdsWithVariations(movementIdList)
    : undefined

  const workouts = await findWorkoutsByGymAndDateRange(gymId, fromDate, toDate, { publishedOnly, movementIds })
  res.json(workouts)
}

async function createWorkoutForProgram(req: Request, res: Response) {
  const parsed = CreateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const { programId, title, description, type, scheduledAt, dayOrder, movementIds } = parsed.data
  const gymId = req.params.gymId as string
  const scheduledAtDate = new Date(scheduledAt)
  const resolvedDayOrder = dayOrder ?? await countWorkoutsOnSameDay(gymId, scheduledAtDate)
  const workout = await createWorkoutForProgramDb({
    programId,
    title,
    description,
    type,
    scheduledAt: scheduledAtDate,
    dayOrder: resolvedDayOrder,
    movementIds,
  })
  res.status(201).json(workout)
}

async function batchPublishWorkoutsForGym(req: Request, res: Response) {
  const gymId = req.params.gymId as string
  const { from, to } = req.body as { from?: string; to?: string }
  if (!from || !to) return res.status(400).json({ error: 'Body fields from and to are required' })

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format for from or to' })
  }

  const result = await publishWorkoutsByGymAndDateRange(gymId, fromDate, toDate)
  res.json({ published: result.count })
}

async function getWorkoutById(req: Request, res: Response) {
  const workout = await findWorkoutById(req.params.id as string)
  if (!workout) return res.status(404).json({ error: 'Workout not found' })
  const { program, ...rest } = workout
  res.json({ ...rest, program: program ? { id: program.id, name: program.name } : null })
}

async function patchWorkout(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })

  const parsed = UpdateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const { title, description, type, scheduledAt, dayOrder, movementIds, namedWorkoutId } = parsed.data
  const workout = await updateWorkout(id, {
    title,
    description,
    type,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    dayOrder,
    movementIds,
    namedWorkoutId,
  })
  res.json(workout)
}

async function publishSingleWorkout(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })

  if (existing.status === 'PUBLISHED') {
    return res.status(409).json({ error: 'Workout is already published' })
  }

  const workout = await publishWorkoutById(id)
  res.json(workout)
}

async function deleteWorkoutById(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })

  await deleteWorkout(id)
  res.status(204).send()
}

async function applyTemplate(req: Request, res: Response) {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })
  if (!existing.namedWorkoutId) return res.status(400).json({ error: 'Workout has no named workout set' })

  const workout = await applyTemplateToWorkout(id)
  res.json(workout)
}
