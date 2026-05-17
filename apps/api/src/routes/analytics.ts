import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getConsistencyDataForUser,
  getTopStrengthMovementsForUser,
  getStrengthPRTrajectoryForUser,
  getLoggedMovementsForUser,
  getMovementPrsByTypeForUser,
  getMovementTrajectoryByTypeForUser,
} from '@wodalytics/db'
import { MovementPrTypeSchema, TrajectoryRangeSchema } from '@wodalytics/types'
import type { MovementPrType, TrajectoryRange } from '@wodalytics/types'

const router = Router()

// GET /api/me/analytics/consistency?weeks=16
router.get('/me/analytics/consistency', requireAuth, getMyConsistency)
// GET /api/me/analytics/tracked-movements?days=60&limit=5
router.get('/me/analytics/tracked-movements', requireAuth, getMyTrackedMovements)
// GET /api/me/analytics/strength-trajectory?movementId=...&range=1M
router.get('/me/analytics/strength-trajectory', requireAuth, getMyStrengthTrajectory)
// GET /api/me/analytics/movements
router.get('/me/analytics/movements', requireAuth, getMyMovements)
// GET /api/me/analytics/movements/:movementId/trajectory?prType=...&range=1M
// (registered before /:movementId so "trajectory" literal isn't captured as an id)
router.get('/me/analytics/movements/:movementId/trajectory', requireAuth, getMyMovementTrajectory)
// GET /api/me/analytics/movements/:movementId
router.get('/me/analytics/movements/:movementId', requireAuth, getMyMovementPrs)

export default router

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function getMyConsistency(req: Request, res: Response) {
  const userId = req.user!.id
  const weeksParam = parseInt(String(req.query.weeks ?? '16'), 10)
  const weeks = isNaN(weeksParam) || weeksParam < 1 ? 16 : Math.min(weeksParam, 52)
  const data = await getConsistencyDataForUser(userId, weeks)
  res.json(data)
}

async function getMyTrackedMovements(req: Request, res: Response) {
  const userId = req.user!.id
  const daysParam = parseInt(String(req.query.days ?? '60'), 10)
  const days = isNaN(daysParam) || daysParam < 1 ? 60 : Math.min(daysParam, 365)
  const limitParam = parseInt(String(req.query.limit ?? '5'), 10)
  const limit = isNaN(limitParam) || limitParam < 1 ? 5 : Math.min(limitParam, 10)
  const data = await getTopStrengthMovementsForUser(userId, days, limit)
  res.json(data)
}

async function getMyStrengthTrajectory(req: Request, res: Response) {
  const userId = req.user!.id
  const movementId = String(req.query.movementId ?? '')
  if (!movementId) {
    res.status(400).json({ error: 'movementId is required' })
    return
  }
  const rangeRaw = String(req.query.range ?? '3M')
  const range = TrajectoryRangeSchema.options.includes(rangeRaw as TrajectoryRange)
    ? (rangeRaw as TrajectoryRange)
    : '3M'
  const data = await getStrengthPRTrajectoryForUser(userId, movementId, range)
  res.json(data)
}

async function getMyMovements(req: Request, res: Response) {
  const userId = req.user!.id
  const data = await getLoggedMovementsForUser(userId)
  res.json(data)
}

async function getMyMovementPrs(req: Request, res: Response) {
  const userId = req.user!.id
  const movementId = req.params.movementId as string
  try {
    const data = await getMovementPrsByTypeForUser(userId, movementId)
    res.json(data)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function getMyMovementTrajectory(req: Request, res: Response) {
  const userId = req.user!.id
  const movementId = req.params.movementId as string
  const prTypeRaw = String(req.query.prType ?? '')
  if (!MovementPrTypeSchema.options.includes(prTypeRaw as MovementPrType)) {
    res.status(400).json({ error: `prType must be one of: ${MovementPrTypeSchema.options.join(', ')}` })
    return
  }
  const rangeRaw = String(req.query.range ?? '3M')
  const range = TrajectoryRangeSchema.options.includes(rangeRaw as TrajectoryRange)
    ? (rangeRaw as TrajectoryRange)
    : '3M'
  try {
    const data = await getMovementTrajectoryByTypeForUser(userId, movementId, prTypeRaw as MovementPrType, range)
    res.json(data)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}
