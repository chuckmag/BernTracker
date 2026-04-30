import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth, requireWodalyticsAdmin } from '../middleware/auth.js'
import {
  findAllActiveMovements,
  createPendingMovement,
  findPendingMovements,
  reviewMovementById,
  updatePendingMovementById,
  detectMovementsInText,
} from '../db/movementDbManager.js'
import { SuggestMovementSchema, ReviewMovementSchema, UpdatePendingMovementSchema } from '@wodalytics/types'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// /pending must be registered before /:id to avoid Express treating "pending" as an ID
router.get('/movements', requireAuth, getMovements)
router.post('/movements/suggest', requireAuth, suggestMovement)
router.get('/movements/pending', requireAuth, requireWodalyticsAdmin, getPendingMovements)
router.patch('/movements/:id/review', requireAuth, requireWodalyticsAdmin, reviewMovement)
router.patch('/movements/:id', requireAuth, requireWodalyticsAdmin, updatePendingMovement)
router.post('/movements/detect', requireAuth, detectMovements)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function getMovements(_req: Request, res: Response) {
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
    const movement = await reviewMovementById(id, parsed.data.status)
    res.json(movement)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function updatePendingMovement(req: Request, res: Response) {
  const id = req.params.id as string
  const parsed = UpdatePendingMovementSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  try {
    const movement = await updatePendingMovementById(id, parsed.data)
    res.json(movement)
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode) return res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Error' })
    throw err
  }
}

async function detectMovements(req: Request, res: Response) {
  const { description } = req.body as { description?: string }
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description: Required' })
  }

  const movements = await detectMovementsInText(description)
  res.json(movements)
}
