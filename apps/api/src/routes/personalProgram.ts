import { Router } from 'express'
import type { Request, Response } from 'express'
import { CreateWorkoutSchema } from '@wodalytics/types'
import { WorkoutStatus } from '@wodalytics/db'
import { requireAuth } from '../middleware/auth.js'
import { findOrCreatePersonalProgramForUser } from '../db/programDbManager.js'
import {
  createWorkoutForProgram as createWorkoutForProgramDb,
  findWorkoutsByProgramIdInDateRange,
} from '../db/workoutDbManager.js'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/me/personal-program — returns the caller's personal program,
//        creating it on first call. Idempotent.
router.get('/me/personal-program', requireAuth, getMyPersonalProgram)

// GET  /api/me/personal-program/workouts?from=&to=
//        Personal-program calendar paging. Date range optional; without it
//        every workout in the program is returned (existing list semantics).
router.get('/me/personal-program/workouts', requireAuth, listMyPersonalProgramWorkouts)

// POST /api/me/personal-program/workouts — create a workout in the personal
//        program. Upserts the program on first use. `programId` in the body
//        is stripped before validation so a spoofed id can't escape into
//        another program.
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

  let from: Date | undefined
  let to: Date | undefined
  if (typeof req.query.from === 'string' && typeof req.query.to === 'string') {
    from = new Date(req.query.from)
    to = new Date(req.query.to)
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for from or to' })
    }
  } else if (typeof req.query.from === 'string' || typeof req.query.to === 'string') {
    return res.status(400).json({ error: 'Both from and to are required when filtering by date' })
  }

  const workouts = await findWorkoutsByProgramIdInDateRange(program.id, userId, from, to)
  res.json(workouts)
}

async function createMyPersonalProgramWorkout(req: Request, res: Response) {
  // Strip programId before validation — personal-program workouts always pin
  // to the caller's own program. Otherwise a spoofed programId could land a
  // workout in another program.
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
  // Personal-program workouts auto-publish: there is no audience to gate
  // visibility against (the user is the sole reader/writer), so the
  // DRAFT/PUBLISHED distinction is not meaningful. Without this, the
  // schema's `status @default(DRAFT)` would hide the workout from the
  // viewer's own feed (the gym feed query filters published-only for
  // MEMBER role) and surface a "Draft" pill on the detail page that
  // there's no way to clear from the personal-program UI.
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
    status: WorkoutStatus.PUBLISHED,
  })
  res.status(201).json(workout)
}
