import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findWorkoutPlanForUser,
  findWorkoutPlansForWorkout,
  upsertWorkoutPlanForUser,
  deleteWorkoutPlanForUser,
} from '@wodalytics/db'
import { UpsertWorkoutPlanSchema } from '@wodalytics/types'
import { loadWorkoutAccess, hasWorkoutWriteAccess } from '../middleware/workout.js'

const router = Router()

const STAFF_ROLES = new Set(['OWNER', 'PROGRAMMER', 'COACH'])

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/workouts/:workoutId/plans — all plans for this workout (COACH+ only)
router.get('/workouts/:workoutId/plans', requireAuth, listWorkoutPlans)

// GET /api/workouts/:workoutId/plans/:userId — plan for a specific user (self or COACH+)
router.get('/workouts/:workoutId/plans/:userId', requireAuth, getWorkoutPlanForUser)

// PUT /api/workouts/:workoutId/plans/:userId — upsert plan (self or COACH+)
router.put('/workouts/:workoutId/plans/:userId', requireAuth, upsertWorkoutPlan)

// DELETE /api/workouts/:workoutId/plans/:userId — delete plan (self or COACH+)
router.delete('/workouts/:workoutId/plans/:userId', requireAuth, deleteWorkoutPlan)

export default router

// ─── Helper ───────────────────────────────────────────────────────────────────

function isGymStaff(gymRoles: string[]): boolean {
  return gymRoles.some((r) => STAFF_ROLES.has(r))
}

// ─── Handler functions ────────────────────────────────────────────────────────

async function listWorkoutPlans(req: Request, res: Response) {
  const workoutId = req.params.workoutId as string
  const ctx = await loadWorkoutAccess(workoutId, req.user!.id)

  if (ctx.kind === 'not-found') return res.status(404).json({ error: 'Workout not found' })
  if (ctx.kind === 'no-program') return res.status(403).json({ error: 'Forbidden' })
  if (ctx.kind !== 'gym-linked' || !isGymStaff(ctx.gymRoles)) {
    return res.status(403).json({ error: 'Only coaches can view all plans' })
  }

  const plans = await findWorkoutPlansForWorkout(workoutId)
  res.json(plans)
}

async function getWorkoutPlanForUser(req: Request, res: Response) {
  const { workoutId, userId: targetUserId } = req.params
  const requesterId = req.user!.id

  if (requesterId !== targetUserId) {
    const ctx = await loadWorkoutAccess(workoutId, requesterId)
    if (ctx.kind === 'not-found') return res.status(404).json({ error: 'Workout not found' })
    if (ctx.kind === 'no-program') return res.status(403).json({ error: 'Forbidden' })
    if (ctx.kind !== 'gym-linked' || !isGymStaff(ctx.gymRoles)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
  }

  const plan = await findWorkoutPlanForUser(targetUserId, workoutId)
  if (!plan) return res.status(404).json({ error: 'Plan not found' })
  res.json(plan)
}

async function upsertWorkoutPlan(req: Request, res: Response) {
  const { workoutId, userId: targetUserId } = req.params
  const requesterId = req.user!.id

  const parsed = UpsertWorkoutPlanSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  if (requesterId !== targetUserId) {
    const ctx = await loadWorkoutAccess(workoutId, requesterId)
    if (ctx.kind === 'not-found') return res.status(404).json({ error: 'Workout not found' })
    if (ctx.kind === 'no-program') return res.status(403).json({ error: 'Forbidden' })
    if (!hasWorkoutWriteAccess(ctx)) {
      return res.status(403).json({ error: 'Only coaches can set plans for other members' })
    }
  }

  const plan = await upsertWorkoutPlanForUser({
    userId: targetUserId,
    workoutId,
    level: parsed.data.level ?? null,
    value: (parsed.data.value as any) ?? null,
    notes: parsed.data.notes ?? null,
    createdById: requesterId,
  })
  res.status(200).json(plan)
}

async function deleteWorkoutPlan(req: Request, res: Response) {
  const { workoutId, userId: targetUserId } = req.params
  const requesterId = req.user!.id

  if (requesterId !== targetUserId) {
    const ctx = await loadWorkoutAccess(workoutId, requesterId)
    if (ctx.kind === 'not-found') return res.status(404).json({ error: 'Workout not found' })
    if (ctx.kind === 'no-program') return res.status(403).json({ error: 'Forbidden' })
    if (!hasWorkoutWriteAccess(ctx)) {
      return res.status(403).json({ error: 'Only coaches can delete plans for other members' })
    }
  }

  try {
    await deleteWorkoutPlanForUser(targetUserId, workoutId)
    res.status(204).send()
  } catch (err: unknown) {
    if ((err as Error & { statusCode?: number }).statusCode === 404) {
      return res.status(404).json({ error: (err as Error).message })
    }
    throw err
  }
}
