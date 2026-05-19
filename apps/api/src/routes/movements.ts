import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth, requireWodalyticsAdmin } from '../middleware/auth.js'
import {
  findAllActiveMovements,
  findLibraryMovementsForAdmin,
  createPendingMovement,
  findPendingMovements,
  reviewMovementById,
  updateMovementById,
  findMovementPrAndHistoryForUser,
} from '@wodalytics/db'
import { SuggestMovementSchema, ReviewMovementSchema, UpdateMovementSchema } from '@wodalytics/types'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// /pending must be registered before /:id to avoid Express treating it as an ID.
// `POST /movements/detect` was removed in #330 — clients now run the matcher
// against their cached catalog via @wodalytics/types#detectMovementsInText.
router.get('/movements', requireAuth, getMovements)
router.post('/movements/suggest', requireAuth, suggestMovement)
router.get('/movements/pending', requireAuth, requireWodalyticsAdmin, getPendingMovements)
router.get('/movements/:id/my-history', requireAuth, getMyMovementHistory)
router.patch('/movements/:id/review', requireAuth, requireWodalyticsAdmin, reviewMovement)
router.patch('/movements/:id', requireAuth, requireWodalyticsAdmin, updateMovement)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function getMovements(req: Request, res: Response) {
  if (req.query.view === 'library') {
    const isAdmin = req.user?.isWodalyticsAdmin ?? false
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' })
    const movements = await findLibraryMovementsForAdmin()
    return res.json(movements)
  }
  const movements = await findAllActiveMovements()
  res.json(movements)
}

async function suggestMovement(req: Request, res: Response) {
  const parsed = SuggestMovementSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  try {
    const movement = await createPendingMovement(parsed.data)
    res.status(201).json(movement)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function getPendingMovements(_req: Request, res: Response) {
  const movements = await findPendingMovements()
  res.json(movements)
}

async function reviewMovement(req: Request, res: Response) {
  const id = req.params.id as string
  const parsed = ReviewMovementSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  try {
    const { status, category, prTypes } = parsed.data
    const movement = await reviewMovementById(id, status, { category, prTypes })
    res.json(movement)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function updateMovement(req: Request, res: Response) {
  const id = req.params.id as string
  const parsed = UpdateMovementSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  try {
    const movement = await updateMovementById(id, parsed.data)
    res.json(movement)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function getMyMovementHistory(req: Request, res: Response) {
  const movementId = req.params.id as string
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10))

  try {
    const data = await findMovementPrAndHistoryForUser(req.user!.id, movementId, { page, limit })
    res.json(data)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}
