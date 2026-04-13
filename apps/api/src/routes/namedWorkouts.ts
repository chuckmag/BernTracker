import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findAllActiveNamedWorkouts,
  findNamedWorkoutById,
  createNamedWorkoutWithOptionalTemplate,
  updateNamedWorkoutById,
} from '../db/namedWorkoutDbManager.js'
import { CreateNamedWorkoutSchema, UpdateNamedWorkoutSchema } from '@berntracker/types'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/named-workouts', requireAuth, listNamedWorkouts)
router.get('/named-workouts/:id', requireAuth, getNamedWorkout)
router.post('/named-workouts', requireAuth, createNamedWorkout)
router.patch('/named-workouts/:id', requireAuth, patchNamedWorkout)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listNamedWorkouts(_req: Request, res: Response) {
  const namedWorkouts = await findAllActiveNamedWorkouts()
  res.json(namedWorkouts)
}

async function getNamedWorkout(req: Request, res: Response) {
  const namedWorkout = await findNamedWorkoutById(req.params.id as string)
  if (!namedWorkout) return res.status(404).json({ error: 'Named workout not found' })
  res.json(namedWorkout)
}

async function createNamedWorkout(req: Request, res: Response) {
  const parsed = CreateNamedWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const namedWorkout = await createNamedWorkoutWithOptionalTemplate(parsed.data)
  res.status(201).json(namedWorkout)
}

async function patchNamedWorkout(req: Request, res: Response) {
  const id = req.params.id as string

  const existing = await findNamedWorkoutById(id)
  if (!existing) return res.status(404).json({ error: 'Named workout not found' })

  const parsed = UpdateNamedWorkoutSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const namedWorkout = await updateNamedWorkoutById(id, parsed.data)
  res.json(namedWorkout)
}
