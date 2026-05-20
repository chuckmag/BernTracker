import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findBenchmarkSummaryForUser,
  findBenchmarkHistoryForUser,
  logBenchmarkResult,
  updateBenchmarkResult,
  deleteBenchmarkResult,
  detectAndCompleteBenchmarkGoals,
} from '@wodalytics/db'
import { CreateBenchmarkResultSchema, UpdateBenchmarkResultSchema, derivePrimaryScore } from '@wodalytics/types'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/me/benchmarks
router.get('/me/benchmarks', requireAuth, listBenchmarks)

// GET /api/me/benchmarks/:namedWorkoutId
router.get('/me/benchmarks/:namedWorkoutId', requireAuth, getBenchmarkDetail)

// POST /api/me/benchmarks/:namedWorkoutId/results
router.post('/me/benchmarks/:namedWorkoutId/results', requireAuth, createBenchmarkResultHandler)

// PATCH /api/me/benchmarks/:namedWorkoutId/results/:id
router.patch('/me/benchmarks/:namedWorkoutId/results/:id', requireAuth, updateBenchmarkResultHandler)

// DELETE /api/me/benchmarks/:namedWorkoutId/results/:id
router.delete('/me/benchmarks/:namedWorkoutId/results/:id', requireAuth, deleteBenchmarkResultHandler)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listBenchmarks(req: Request, res: Response) {
  const summary = await findBenchmarkSummaryForUser(req.user!.id)
  res.json(summary)
}

async function getBenchmarkDetail(req: Request, res: Response) {
  const result = await findBenchmarkHistoryForUser(req.user!.id, req.params.namedWorkoutId as string)
  if (!result) return res.status(404).json({ error: 'Named workout not found' })
  res.json(result)
}

async function createBenchmarkResultHandler(req: Request, res: Response) {
  const parsed = CreateBenchmarkResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { achievedAt, level, workoutGender, value, notes } = parsed.data
  const score = derivePrimaryScore(value)

  try {
    const result = await logBenchmarkResult(req.user!.id, req.params.namedWorkoutId as string, {
      achievedAt: new Date(achievedAt),
      level,
      workoutGender,
      value,
      notes,
      primaryScoreKind: score?.kind ?? null,
      primaryScoreValue: score?.value ?? null,
    })
    if (!result) return res.status(404).json({ error: 'Named workout not found' })

    // Goal auto-completion for benchmark goals on this NamedWorkout.
    await detectAndCompleteBenchmarkGoals(
      req.user!.id,
      req.params.namedWorkoutId as string,
      score?.kind ?? null,
      score?.value ?? null,
    )

    res.status(201).json(result)
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A result already exists for this date and time' })
    }
    throw err
  }
}

async function updateBenchmarkResultHandler(req: Request, res: Response) {
  const parsed = UpdateBenchmarkResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { achievedAt, level, workoutGender, value, notes } = parsed.data
  const score = value !== undefined ? derivePrimaryScore(value) : undefined

  try {
    const result = await updateBenchmarkResult(req.params.id as string, req.user!.id, {
      achievedAt: achievedAt !== undefined ? new Date(achievedAt) : undefined,
      level,
      workoutGender,
      value,
      notes,
      primaryScoreKind: score !== undefined ? (score?.kind ?? null) : undefined,
      primaryScoreValue: score !== undefined ? (score?.value ?? null) : undefined,
    })
    res.json(result)
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Result not found' })
    }
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A result already exists for this date and time' })
    }
    throw err
  }
}

async function deleteBenchmarkResultHandler(req: Request, res: Response) {
  try {
    await deleteBenchmarkResult(req.params.id as string, req.user!.id)
    res.status(204).send()
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Result not found' })
    }
    throw err
  }
}
