import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getConsistencyDataForUser,
  getTopStrengthMovementsForUser,
  getStrengthPRTrajectoryForUser,
} from '../db/analyticsDbManager.js'

const router = Router()

// GET /api/me/analytics/consistency?weeks=16
router.get('/me/analytics/consistency', requireAuth, getMyConsistency)
// GET /api/me/analytics/tracked-movements?days=60&limit=5
router.get('/me/analytics/tracked-movements', requireAuth, getMyTrackedMovements)
// GET /api/me/analytics/strength-trajectory?movementId=...&range=1M
router.get('/me/analytics/strength-trajectory', requireAuth, getMyStrengthTrajectory)

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
  const range = ['1M', '3M', '6M', '1Y'].includes(rangeRaw)
    ? (rangeRaw as '1M' | '3M' | '6M' | '1Y')
    : '3M'
  const data = await getStrengthPRTrajectoryForUser(userId, movementId, range)
  res.json(data)
}
