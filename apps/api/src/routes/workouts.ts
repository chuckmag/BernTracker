import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validateGymExists, requireGymMembership, requireWorkoutGymMembership } from '../middleware/gym.js'
import {
  createWorkoutForProgram,
  findWorkoutsByGymAndDateRange,
  findWorkoutById,
  updateWorkout,
  publishWorkoutById,
  publishWorkoutsByGymAndDateRange,
  deleteWorkout,
} from '../db/workoutDbManager.js'
import { CreateWorkoutSchema, UpdateWorkoutSchema } from '@berntracker/types'
import { Role } from '@berntracker/db'

const router = Router()

const canWrite = requireRole('OWNER', 'PROGRAMMER', 'COACH')
const gymGuards = [requireAuth, validateGymExists, requireGymMembership] as const

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

  const publishedOnly = req.user!.role === Role.MEMBER
  const workouts = await findWorkoutsByGymAndDateRange(gymId, fromDate, toDate, { publishedOnly })
  res.json(workouts)
}

async function createWorkoutInGym(req: Request, res: Response) {
  const parsed = CreateWorkoutSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { programId, title, description, type, scheduledAt } = parsed.data
  const workout = await createWorkoutForProgram({
    programId,
    title,
    description,
    type,
    scheduledAt: new Date(scheduledAt),
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
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { title, description, type, scheduledAt } = parsed.data
  const workout = await updateWorkout(id, {
    title,
    description,
    type,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/gyms/:gymId/workouts?from=&to=
router.get('/gyms/:gymId/workouts', ...gymGuards, getWorkoutsByGymAndDateRange)

// POST /api/gyms/:gymId/workouts
router.post('/gyms/:gymId/workouts', ...gymGuards, canWrite, createWorkoutInGym)

// POST /api/gyms/:gymId/workouts/publish — batch publish by date range
router.post('/gyms/:gymId/workouts/publish', ...gymGuards, canWrite, batchPublishWorkoutsForGym)

// GET /api/workouts/:id
router.get('/workouts/:id', requireAuth, requireWorkoutGymMembership, getWorkoutById)

// PATCH /api/workouts/:id
router.patch('/workouts/:id', requireAuth, requireWorkoutGymMembership, canWrite, patchWorkout)

// POST /api/workouts/:id/publish
router.post('/workouts/:id/publish', requireAuth, requireWorkoutGymMembership, canWrite, publishSingleWorkout)

// DELETE /api/workouts/:id
router.delete('/workouts/:id', requireAuth, requireWorkoutGymMembership, canWrite, deleteWorkoutById)

export default router
