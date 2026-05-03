/**
 * WODalytics admin surface (#160). Curates unaffiliated/public-catalog
 * programs (e.g. the CrossFit Mainsite ingest) without granting access to any
 * gym-scoped data. Slice 2 is read-only — list, detail, workouts. Slice 3
 * adds mutations behind the same `requireWodalyticsAdmin` gate.
 *
 * Every route is gated by `requireAuth + requireWodalyticsAdmin`. Empty /
 * unset `WODALYTICS_ADMIN_EMAILS` → 403 (deny by default).
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth, requireWodalyticsAdmin } from '../middleware/auth.js'
import {
  findAllUnaffiliatedPrograms,
  findUnaffiliatedProgramByIdWithCounts,
} from '../db/programDbManager.js'
import { findWorkoutsByProgramId } from '../db/workoutDbManager.js'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/admin/programs', requireAuth, requireWodalyticsAdmin, listAdminPrograms)
router.get('/admin/programs/:id', requireAuth, requireWodalyticsAdmin, getAdminProgramById)
router.get(
  '/admin/programs/:id/workouts',
  requireAuth,
  requireWodalyticsAdmin,
  listAdminProgramWorkouts,
)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listAdminPrograms(_req: Request, res: Response) {
  const programs = await findAllUnaffiliatedPrograms()
  res.json(programs)
}

async function getAdminProgramById(req: Request, res: Response) {
  const id = req.params.id as string
  const program = await findUnaffiliatedProgramByIdWithCounts(id)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  res.json(program)
}

async function listAdminProgramWorkouts(req: Request, res: Response) {
  const id = req.params.id as string
  // Re-check the program is unaffiliated. Without this an admin could read
  // a gym-scoped program's workouts via the admin path, which would muddle
  // the auth boundary.
  const program = await findUnaffiliatedProgramByIdWithCounts(id)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return
  }
  const workouts = await findWorkoutsByProgramId(id)
  res.json(workouts)
}
