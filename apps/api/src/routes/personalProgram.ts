import { Router } from 'express'
import type { Request, Response } from 'express'
import { CreateWorkoutSchema } from '@wodalytics/types'
import { requireAuth } from '../middleware/auth.js'
import { findOrCreatePersonalProgramForUser } from '../db/programDbManager.js'
import {
  createWorkoutForProgram as createWorkoutForProgramDb,
  findWorkoutsByProgramId,
} from '../db/workoutDbManager.js'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/me/personal-program — returns the caller's personal program,
//        creating it on first call. Idempotent.
router.get('/me/personal-program', requireAuth, getMyPersonalProgram)

// GET  /api/me/personal-program/workouts — list every workout in the personal program.
//        No date range / publish-state filter — it's a single-user private program.
router.get('/me/personal-program/workouts', requireAuth, listMyPersonalProgramWorkouts)

// POST /api/me/personal-program/workouts — create a workout in the personal program.
//        Upserts the program if missing so the user doesn't need to call GET first.
//        `programId` in the body is ignored (we always pin to the personal program).
router.post('/me/personal-program/workouts', requireAuth, createMyPersonalProgramWorkout)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function getMyPersonalProgram(req: Request, res: Response) {
  const userId = req.user!.id
  const program = await findOrCreatePersonalProgramForUser(userId)
  res.json(program)
}

async function listMyPersonalProgramWorkouts(req: Request, res: Response) {
  const userId = req.user!.id
  const program = await findOrCreatePersonalProgramForUser(userId)
  const workouts = await findWorkoutsByProgramId(program.id, userId)
  res.json(workouts)
}

async function createMyPersonalProgramWorkout(req: Request, res: Response) {
  // Strip programId from the body before validating — personal-program workouts
  // always pin to the caller's own program. Otherwise a spoofed programId could
  // escape into another program.
  const body = (req.body && typeof req.body === 'object') ? { ...req.body } : {}
  delete (body as Record<string, unknown>).programId
  const parsed = CreateWorkoutSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const userId = req.user!.id
  const program = await findOrCreatePersonalProgramForUser(userId)

  const { title, description, type, scheduledAt, dayOrder, movementIds, movements, timeCapSeconds, tracksRounds } = parsed.data
  const workout = await createWorkoutForProgramDb({
    programId: program.id,
    title,
    description,
    type,
    scheduledAt: new Date(scheduledAt),
    dayOrder: dayOrder ?? 0,
    movementIds,
    movements,
    timeCapSeconds,
    tracksRounds,
  })
  res.status(201).json(workout)
}

