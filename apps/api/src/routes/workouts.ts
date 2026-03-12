import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { findGymById } from '../db/gymDbManager.js'
import {
  createWorkoutForProgram,
  findWorkoutsByGymAndDateRange,
  findWorkoutById,
  updateWorkout,
  publishWorkout,
  deleteWorkout,
} from '../db/workoutDbManager.js'
import { CreateWorkoutSchema, UpdateWorkoutSchema } from '@berntracker/types'

const router = Router()

const canWrite = requireRole('OWNER', 'PROGRAMMER', 'COACH')

// GET /api/gyms/:gymId/workouts?from=&to=
router.get('/gyms/:gymId/workouts', requireAuth, async (req, res) => {
  const gymId = req.params.gymId as string
  const gym = await findGymById(gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

  const from = req.query.from as string | undefined
  const to = req.query.to as string | undefined
  if (!from || !to) return res.status(400).json({ error: 'Query params from and to are required' })

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date format for from or to' })
  }

  const workouts = await findWorkoutsByGymAndDateRange(gymId, fromDate, toDate)
  res.json(workouts)
})

// POST /api/gyms/:gymId/workouts
router.post('/gyms/:gymId/workouts', requireAuth, canWrite, async (req, res) => {
  const gymId = req.params.gymId as string
  const gym = await findGymById(gymId)
  if (!gym) return res.status(404).json({ error: 'Gym not found' })

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
})

// GET /api/workouts/:id
router.get('/workouts/:id', requireAuth, async (req, res) => {
  const workout = await findWorkoutById(req.params.id as string)
  if (!workout) return res.status(404).json({ error: 'Workout not found' })
  res.json(workout)
})

// PATCH /api/workouts/:id
router.patch('/workouts/:id', requireAuth, canWrite, async (req, res) => {
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
})

// POST /api/workouts/:id/publish
router.post('/workouts/:id/publish', requireAuth, canWrite, async (req, res) => {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })

  if (existing.status === 'PUBLISHED') {
    return res.status(409).json({ error: 'Workout is already published' })
  }

  const workout = await publishWorkout(id)
  res.json(workout)
})

// DELETE /api/workouts/:id
router.delete('/workouts/:id', requireAuth, canWrite, async (req, res) => {
  const id = req.params.id as string
  const existing = await findWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Workout not found' })

  await deleteWorkout(id)
  res.status(204).send()
})

export default router
