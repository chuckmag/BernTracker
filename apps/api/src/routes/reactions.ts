import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  addReactionToResult,
  removeReactionFromResult,
  addReactionToComment,
  removeReactionFromComment,
  ALLOWED_EMOJIS,
} from '../db/reactionDbManager.js'

const router = Router()

// POST /api/results/:resultId/reactions
router.post('/results/:resultId/reactions', requireAuth, addResultReaction)

// DELETE /api/results/:resultId/reactions/:emoji
router.delete('/results/:resultId/reactions/:emoji', requireAuth, removeResultReaction)

// POST /api/comments/:commentId/reactions
router.post('/comments/:commentId/reactions', requireAuth, addCommentReaction)

// DELETE /api/comments/:commentId/reactions/:emoji
router.delete('/comments/:commentId/reactions/:emoji', requireAuth, removeCommentReaction)

export default router

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function addResultReaction(req: Request, res: Response) {
  const { resultId } = req.params
  const { emoji } = req.body as { emoji?: string }
  if (!emoji) return res.status(400).json({ error: 'emoji is required', allowed: ALLOWED_EMOJIS })

  try {
    const reaction = await addReactionToResult(resultId, req.user!.id, emoji)
    res.status(201).json(reaction)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 400) return res.status(400).json({ error: (err as Error).message, allowed: ALLOWED_EMOJIS })
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    if (code === 409) return res.status(409).json({ error: (err as Error).message })
    throw err
  }
}

async function removeResultReaction(req: Request, res: Response) {
  const { resultId, emoji } = req.params

  try {
    await removeReactionFromResult(resultId, req.user!.id, decodeURIComponent(emoji))
    res.status(204).send()
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 400) return res.status(400).json({ error: (err as Error).message, allowed: ALLOWED_EMOJIS })
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    throw err
  }
}

async function addCommentReaction(req: Request, res: Response) {
  const { commentId } = req.params
  const { emoji } = req.body as { emoji?: string }
  if (!emoji) return res.status(400).json({ error: 'emoji is required', allowed: ALLOWED_EMOJIS })

  try {
    const reaction = await addReactionToComment(commentId, req.user!.id, emoji)
    res.status(201).json(reaction)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 400) return res.status(400).json({ error: (err as Error).message, allowed: ALLOWED_EMOJIS })
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    if (code === 409) return res.status(409).json({ error: (err as Error).message })
    if (code === 422) return res.status(422).json({ error: (err as Error).message })
    throw err
  }
}

async function removeCommentReaction(req: Request, res: Response) {
  const { commentId, emoji } = req.params

  try {
    await removeReactionFromComment(commentId, req.user!.id, decodeURIComponent(emoji))
    res.status(204).send()
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 400) return res.status(400).json({ error: (err as Error).message, allowed: ALLOWED_EMOJIS })
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    throw err
  }
}
