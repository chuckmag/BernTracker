import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findAllActiveNamedWorkouts,
  findNamedWorkoutById,
  findAllBenchmarkResultsForUser,
  findBenchmarkResultsForUser,
  findResultsByUserForNamedWorkout,
  createBenchmarkResult,
  updateBenchmarkResult,
  deleteBenchmarkResult,
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
  const userId = req.user!.id

  const [namedWorkouts, allResults] = await Promise.all([
    findAllActiveNamedWorkouts(),
    findAllBenchmarkResultsForUser(userId),
  ])

  // Group manual results by namedWorkoutName for O(1) lookup per workout
  const resultsByName = new Map<string, typeof allResults>()
  for (const r of allResults) {
    const bucket = resultsByName.get(r.namedWorkoutName) ?? []
    bucket.push(r)
    resultsByName.set(r.namedWorkoutName, bucket)
  }

  const response = namedWorkouts.map((nw) => {
    const results = resultsByName.get(nw.name) ?? []
    return {
      ...nw,
      manualResultCount: results.length,
      // results are already ordered achievedAt desc — first is the latest
      latestResult: results[0] ?? null,
    }
  })

  res.json(response)
}

async function getBenchmarkDetail(req: Request, res: Response) {
  const userId = req.user!.id
  const namedWorkoutId = req.params.namedWorkoutId as string

  const namedWorkout = await findNamedWorkoutById(namedWorkoutId)
  if (!namedWorkout) return res.status(404).json({ error: 'Named workout not found' })

  const [manualResults, programmedResults] = await Promise.all([
    findBenchmarkResultsForUser(userId, namedWorkout.name),
    findResultsByUserForNamedWorkout(userId, namedWorkoutId),
  ])

  const history = [
    ...manualResults.map((r) => ({
      source: 'manual' as const,
      id: r.id,
      achievedAt: r.achievedAt,
      level: r.level,
      workoutGender: r.workoutGender,
      value: r.value,
      notes: r.notes,
      primaryScoreKind: r.primaryScoreKind,
      primaryScoreValue: r.primaryScoreValue,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    ...programmedResults.map((r) => ({
      source: 'programmed' as const,
      id: r.id,
      achievedAt: r.workout.scheduledAt,
      level: r.level,
      workoutGender: r.workoutGender,
      value: r.value,
      notes: r.notes,
      primaryScoreKind: r.primaryScoreKind,
      primaryScoreValue: r.primaryScoreValue,
      workoutId: r.workoutId,
      workoutScheduledAt: r.workout.scheduledAt,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())

  res.json({ namedWorkout, history })
}

async function createBenchmarkResultHandler(req: Request, res: Response) {
  const userId = req.user!.id
  const namedWorkoutId = req.params.namedWorkoutId as string

  const namedWorkout = await findNamedWorkoutById(namedWorkoutId)
  if (!namedWorkout) return res.status(404).json({ error: 'Named workout not found' })

  const parsed = CreateBenchmarkResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { achievedAt, level, workoutGender, value, notes } = parsed.data
  const score = derivePrimaryScore(value)

  try {
    const result = await createBenchmarkResult({
      userId,
      namedWorkoutName: namedWorkout.name,
      achievedAt: new Date(achievedAt),
      level,
      workoutGender,
      value,
      notes,
      primaryScoreKind: score?.kind ?? undefined,
      primaryScoreValue: score?.value ?? undefined,
    })
    res.status(201).json(result)
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A result already exists for this date and time' })
    }
    throw err
  }
}

async function updateBenchmarkResultHandler(req: Request, res: Response) {
  const userId = req.user!.id
  const id = req.params.id as string

  const parsed = UpdateBenchmarkResultSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { achievedAt, level, workoutGender, value, notes } = parsed.data

  let primaryScoreKind: string | undefined
  let primaryScoreValue: number | undefined
  if (value !== undefined) {
    const score = derivePrimaryScore(value)
    primaryScoreKind = score?.kind ?? undefined
    primaryScoreValue = score?.value ?? undefined
  }

  try {
    const result = await updateBenchmarkResult(id, userId, {
      achievedAt: achievedAt !== undefined ? new Date(achievedAt) : undefined,
      level,
      workoutGender,
      value,
      notes: notes === null ? undefined : notes,
      primaryScoreKind,
      primaryScoreValue,
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
  const userId = req.user!.id
  const id = req.params.id as string

  try {
    await deleteBenchmarkResult(id, userId)
    res.status(204).send()
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Result not found' })
    }
    throw err
  }
}
