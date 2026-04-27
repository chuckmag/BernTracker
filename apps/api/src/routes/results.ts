import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createResult, findLeaderboardByWorkout, findResultHistoryByUser, updateResultByOwner, deleteResultByOwner } from '../db/resultDbManager.js'
import { expandMovementIdsWithVariations } from '../db/movementDbManager.js'
import { CreateResultSchema, UpdateResultSchema } from '@wodalytics/types'
import type { WorkoutLevel, WorkoutGender } from '@wodalytics/db'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/workouts/:workoutId/results
router.post('/workouts/:workoutId/results', requireAuth, logResult)

// GET /api/workouts/:workoutId/results
router.get('/workouts/:workoutId/results', requireAuth, getWorkoutLeaderboard)

// GET /api/me/results
router.get('/me/results', requireAuth, getUserResultHistory)

// PATCH /api/results/:resultId
router.patch('/results/:resultId', requireAuth, updateResult)

// DELETE /api/results/:resultId
router.delete('/results/:resultId', requireAuth, deleteResult)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function logResult(req: Request, res: Response) {
  const workoutId = req.params.workoutId as string

  const parsed = CreateResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { level, workoutGender, value, notes } = parsed.data

  try {
    const result = await createResult({
      userId: req.user!.id,
      workoutId,
      level,
      workoutGender,
      value,
      notes,
    })
    res.status(201).json(result)
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 409) {
      return res.status(409).json({ error: err.message })
    }
    throw err
  }
}

async function getWorkoutLeaderboard(req: Request, res: Response) {
  const workoutId = req.params.workoutId as string
  const level = req.query.level as WorkoutLevel | undefined
  const workoutGender = req.query.gender as WorkoutGender | undefined

  const leaderboard = await findLeaderboardByWorkout(workoutId, { level, workoutGender })
  res.json(leaderboard)
}

async function updateResult(req: Request, res: Response) {
  const resultId = req.params.resultId as string

  const parsed = UpdateResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const updated = await updateResultByOwner(resultId, req.user!.id, parsed.data)
    res.json(updated)
  } catch (err: unknown) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode
    if (statusCode === 404) return res.status(404).json({ error: (err as Error).message })
    if (statusCode === 403) return res.status(403).json({ error: (err as Error).message })
    throw err
  }
}

async function deleteResult(req: Request, res: Response) {
  const resultId = req.params.resultId as string

  try {
    await deleteResultByOwner(resultId, req.user!.id)
    res.status(204).send()
  } catch (err: unknown) {
    const statusCode = (err as Error & { statusCode?: number }).statusCode
    if (statusCode === 404) return res.status(404).json({ error: (err as Error).message })
    if (statusCode === 403) return res.status(403).json({ error: (err as Error).message })
    throw err
  }
}

async function getUserResultHistory(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))
  const rawIds = req.query.movementIds
  const rawMovementIds = Array.isArray(rawIds)
    ? (rawIds as string[])
    : typeof rawIds === 'string' && rawIds
      ? rawIds.split(',')
      : []
  const movementIds = rawMovementIds.length ? await expandMovementIdsWithVariations(rawMovementIds) : []

  const history = await findResultHistoryByUser(req.user!.id, { page, limit, movementIds: movementIds.length ? movementIds : undefined })
  res.json(history)
}
