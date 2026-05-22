import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  createGoalForUser,
  findGoalById,
  findGoalsForUser,
  updateGoalByOwner,
  deleteGoalByOwner,
  computeGoalProgress,
} from '@wodalytics/db'
import type { GoalWithRelations } from '@wodalytics/db'
import { CreateGoalSchema, UpdateGoalSchema, GoalStatusSchema } from '@wodalytics/types'
import type { GoalResponse } from '@wodalytics/types'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET    /api/users/me/goals?status=ACTIVE|COMPLETED|ARCHIVED
router.get('/users/me/goals', requireAuth, listGoalsForCurrentUser)

// POST   /api/users/me/goals
router.post('/users/me/goals', requireAuth, createGoalHandler)

// GET    /api/goals/:goalId
router.get('/goals/:goalId', requireAuth, getGoalHandler)

// PATCH  /api/goals/:goalId
router.patch('/goals/:goalId', requireAuth, updateGoalHandler)

// DELETE /api/goals/:goalId
router.delete('/goals/:goalId', requireAuth, deleteGoalHandler)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listGoalsForCurrentUser(req: Request, res: Response) {
  const statusRaw = req.query.status
  let status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' | undefined
  if (typeof statusRaw === 'string') {
    const parsed = GoalStatusSchema.safeParse(statusRaw)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid status filter' })
    status = parsed.data
  }
  const goals = await findGoalsForUser(req.user!.id, { status })
  const responses = await Promise.all(goals.map(toGoalResponse))
  res.json(responses)
}

async function createGoalHandler(req: Request, res: Response) {
  const parsed = CreateGoalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const goal = await createGoalForUser(req.user!.id, mapInputToCreateData(parsed.data))
  const response = await toGoalResponse(goal)
  res.status(201).json(response)
}

async function getGoalHandler(req: Request, res: Response) {
  const goalId = req.params.goalId as string
  const goal = await findGoalById(goalId)
  if (!goal) return res.status(404).json({ error: 'Goal not found' })
  if (goal.userId !== req.user!.id) return res.status(403).json({ error: 'You do not own this goal' })
  res.json(await toGoalResponse(goal))
}

async function updateGoalHandler(req: Request, res: Response) {
  const goalId = req.params.goalId as string
  const parsed = UpdateGoalSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const goal = await updateGoalByOwner(goalId, req.user!.id, {
      title: parsed.data.title,
      targetDate: parsed.data.targetDate === undefined ? undefined : parsed.data.targetDate === null ? null : new Date(parsed.data.targetDate),
      status: parsed.data.status,
    })
    res.json(await toGoalResponse(goal))
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 403) return res.status(403).json({ error: 'You do not own this goal' })
    if (code === 404) return res.status(404).json({ error: 'Goal not found' })
    throw err
  }
}

async function deleteGoalHandler(req: Request, res: Response) {
  const goalId = req.params.goalId as string
  try {
    await deleteGoalByOwner(goalId, req.user!.id)
    res.status(204).send()
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 403) return res.status(403).json({ error: 'You do not own this goal' })
    if (code === 404) return res.status(404).json({ error: 'Goal not found' })
    throw err
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Wire format: ISO date strings + computed progress. The DB rows carry Date
// objects and have no progress field; the API surface is what the UI parses,
// so we shape it here rather than in the manager.
async function toGoalResponse(goal: GoalWithRelations): Promise<GoalResponse> {
  const progress = await computeGoalProgress(goal)
  return {
    id: goal.id,
    userId: goal.userId,
    type: goal.type,
    status: goal.status,
    title: goal.title,
    targetDate: goal.targetDate ? goal.targetDate.toISOString() : null,
    movementId: goal.movementId,
    namedWorkoutId: goal.namedWorkoutId,
    targetPrType: goal.targetPrType as GoalResponse['targetPrType'],
    targetValue: goal.targetValue,
    targetLoadUnit: goal.targetLoadUnit,
    targetDistanceUnit: goal.targetDistanceUnit,
    targetRepCount: goal.targetRepCount,
    frequencyPerWeek: goal.frequencyPerWeek,
    frequencyWeeks: goal.frequencyWeeks,
    frequencyStartDate: goal.frequencyStartDate ? goal.frequencyStartDate.toISOString() : null,
    completedAt: goal.completedAt ? goal.completedAt.toISOString() : null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    movement: goal.movement,
    namedWorkout: goal.namedWorkout,
    progress,
  }
}

// Maps the discriminated-union CreateGoalInput to the manager's flat
// CreateGoalData shape. Per-type fields not relevant to the variant stay
// undefined (Prisma leaves the column null on insert).
function mapInputToCreateData(input: ReturnType<typeof CreateGoalSchema.parse>) {
  const base = {
    type: input.type,
    title: input.title,
    targetDate: input.targetDate ? new Date(input.targetDate) : null,
  }
  if (input.type === 'PR_TARGET') {
    return {
      ...base,
      movementId: input.movementId ?? null,
      namedWorkoutId: input.namedWorkoutId ?? null,
      targetPrType: input.targetPrType,
      targetValue: input.targetValue,
      targetLoadUnit: input.targetLoadUnit ?? null,
      targetDistanceUnit: input.targetDistanceUnit ?? null,
      targetRepCount: input.targetRepCount ?? null,
    }
  }
  if (input.type === 'FREQUENCY') {
    return {
      ...base,
      frequencyPerWeek: input.frequencyPerWeek,
      frequencyWeeks: input.frequencyWeeks,
      frequencyStartDate: input.frequencyStartDate ? new Date(input.frequencyStartDate) : null,
    }
  }
  // HABIT — base only.
  return base
}
