import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getConsistencyDataForUser } from '../db/analyticsDbManager.js'

const router = Router()

// GET /api/me/analytics/consistency?weeks=16
router.get('/me/analytics/consistency', requireAuth, getMyConsistency)

export default router

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function getMyConsistency(req: Request, res: Response) {
  const userId = req.user!.id
  const weeksParam = parseInt(String(req.query.weeks ?? '16'), 10)
  const weeks = isNaN(weeksParam) || weeksParam < 1 ? 16 : Math.min(weeksParam, 52)
  const data = await getConsistencyDataForUser(userId, weeks)
  res.json(data)
}
