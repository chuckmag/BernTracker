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
  recordCheckIn,
  deleteCheckIn,
  findCheckInsForGoal,
} from '@wodalytics/db'
import type { GoalWithRelations } from '@wodalytics/db'
import type { GoalCheckIn } from '@wodalytics/db'
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  GoalStatusSchema,
  RecordGoalCheckInSchema,
} from '@wodalytics/types'
import type { GoalResponse, GoalCheckInResponse } from '@wodalytics/types'

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

// ─── Habit check-ins ──────────────────────────────────────────────────────────
//
// Per-day confirmation tied to a HABIT-type Goal. PR_TARGET / FREQUENCY
// goals reject these routes with 400.

// POST   /api/goals/:goalId/check-ins
router.post('/goals/:goalId/check-ins', requireAuth, recordCheckInHandler)

// DELETE /api/goals/:goalId/check-ins/:date
router.delete('/goals/:goalId/check-ins/:date', requireAuth, deleteCheckInHandler)

// GET    /api/goals/:goalId/check-ins?since=&until=&limit=
router.get('/goals/:goalId/check-ins', requireAuth, listCheckInsHandler)

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

// ─── Habit check-in handlers ──────────────────────────────────────────────────

// Looks up the goal, verifies ownership, verifies HABIT type. Shared
// preflight for all three check-in routes — keeps ownership / 404 / 400
// behavior identical regardless of which route entered.
async function loadOwnedHabitGoal(req: Request, res: Response): Promise<GoalWithRelations | null> {
  const goalId = req.params.goalId as string
  const goal = await findGoalById(goalId)
  if (!goal) {
    res.status(404).json({ error: 'Goal not found' })
    return null
  }
  if (goal.userId !== req.user!.id) {
    res.status(403).json({ error: 'You do not own this goal' })
    return null
  }
  if (goal.type !== 'HABIT') {
    res.status(400).json({ error: 'Check-ins are only valid for habit goals' })
    return null
  }
  return goal
}

async function recordCheckInHandler(req: Request, res: Response) {
  const goal = await loadOwnedHabitGoal(req, res)
  if (!goal) return

  const parsed = RecordGoalCheckInSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const date = parsed.data.date ? new Date(parsed.data.date) : new Date()
  const row = await recordCheckIn({
    goalId: goal.id,
    userId: req.user!.id,
    date,
    note: parsed.data.note,
  })

  // Return the updated goal (including refreshed HABIT progress) so the
  // client can replace its state without a second round-trip.
  res.status(201).json({
    checkIn: toCheckInResponse(row),
    goal: await toGoalResponse(goal),
  })
}

async function deleteCheckInHandler(req: Request, res: Response) {
  const goal = await loadOwnedHabitGoal(req, res)
  if (!goal) return

  const dateRaw = req.params.date as string
  const date = parseYmd(dateRaw)
  if (!date) return res.status(400).json({ error: 'Date must be a valid YYYY-MM-DD' })

  const removed = await deleteCheckIn(goal.id, date)
  if (!removed) return res.status(404).json({ error: 'No check-in for that date' })

  res.json({ goal: await toGoalResponse(goal) })
}

async function listCheckInsHandler(req: Request, res: Response) {
  const goal = await loadOwnedHabitGoal(req, res)
  if (!goal) return

  const sinceRaw = req.query.since
  const untilRaw = req.query.until
  const limitRaw = req.query.limit

  const since = typeof sinceRaw === 'string' ? parseQueryDate(sinceRaw) : undefined
  const until = typeof untilRaw === 'string' ? parseQueryDate(untilRaw) : undefined
  if (sinceRaw !== undefined && since === null) return res.status(400).json({ error: 'Invalid since date' })
  if (untilRaw !== undefined && until === null) return res.status(400).json({ error: 'Invalid until date' })

  let limit: number | undefined
  if (typeof limitRaw === 'string') {
    const n = Number.parseInt(limitRaw, 10)
    if (!Number.isFinite(n) || n <= 0 || n > 500) {
      return res.status(400).json({ error: 'limit must be 1–500' })
    }
    limit = n
  }

  const rows = await findCheckInsForGoal(goal.id, {
    since: since ?? undefined,
    until: until ?? undefined,
    limit,
  })
  res.json(rows.map(toCheckInResponse))
}

// Accepts YYYY-MM-DD or full ISO. Returns null on malformed input so the
// caller can map it to a 400.
function parseQueryDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return parseYmd(raw)
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

// Parses a YYYY-MM-DD string into a UTC midnight Date, validating that
// the calendar components produce a real date (e.g. rejects 2026-13-99).
function parseYmd(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null
  }
  return d
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

function toCheckInResponse(row: GoalCheckIn): GoalCheckInResponse {
  // `row.date` is a JS Date that the DB stored as DATE — its UTC date
  // components are the canonical wire value.
  const d = row.date
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return {
    id: row.id,
    goalId: row.goalId,
    date: `${d.getUTCFullYear()}-${m}-${day}`,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
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
