import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { validateGymExists, requireGymMembership } from '../middleware/gym.js'
import { getDashboardToday as getDashboardTodayDb } from '../db/dashboardDbManager.js'

const router = Router()

router.get('/gyms/:gymId/dashboard/today', requireAuth, validateGymExists, requireGymMembership, getDashboardToday)

export default router

async function getDashboardToday(req: Request, res: Response) {
  const programIds = req.query.programIds
    ? String(req.query.programIds).split(',').filter(Boolean)
    : undefined
  const data = await getDashboardTodayDb(req.params.gymId as string, req.user!.id, programIds)
  res.json(data)
}
