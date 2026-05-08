import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  findCommentsByResultId,
  createTopLevelComment,
  createReply,
  editComment,
  softDeleteComment,
} from '../db/commentDbManager.js'

const router = Router()

// GET /api/results/:resultId/comments
router.get('/results/:resultId/comments', requireAuth, getResultComments)

// POST /api/results/:resultId/comments
router.post('/results/:resultId/comments', requireAuth, postResultComment)

// POST /api/comments/:commentId/replies
router.post('/comments/:commentId/replies', requireAuth, postCommentReply)

// PATCH /api/comments/:commentId
router.patch('/comments/:commentId', requireAuth, patchComment)

// DELETE /api/comments/:commentId
router.delete('/comments/:commentId', requireAuth, deleteComment)

export default router

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function getResultComments(req: Request, res: Response) {
  const { resultId } = req.params
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))

  try {
    const data = await findCommentsByResultId(resultId, req.user!.id, page, limit)
    res.json(data)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    throw err
  }
}

async function postResultComment(req: Request, res: Response) {
  const { resultId } = req.params
  const { body } = req.body as { body?: string }
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' })

  try {
    const comment = await createTopLevelComment(resultId, req.user!.id, body.trim())
    res.status(201).json(comment)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    throw err
  }
}

async function postCommentReply(req: Request, res: Response) {
  const { commentId } = req.params
  const { body } = req.body as { body?: string }
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' })

  try {
    const reply = await createReply(commentId, req.user!.id, body.trim())
    res.status(201).json(reply)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    if (code === 422) return res.status(422).json({ error: (err as Error).message })
    throw err
  }
}

async function patchComment(req: Request, res: Response) {
  const { commentId } = req.params
  const { body } = req.body as { body?: string }
  if (!body?.trim()) return res.status(400).json({ error: 'body is required' })

  try {
    const updated = await editComment(commentId, req.user!.id, body.trim())
    res.json(updated)
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    if (code === 403) return res.status(403).json({ error: (err as Error).message })
    if (code === 422) return res.status(422).json({ error: (err as Error).message })
    throw err
  }
}

async function deleteComment(req: Request, res: Response) {
  const { commentId } = req.params

  try {
    await softDeleteComment(commentId, req.user!.id)
    res.status(204).send()
  } catch (err: unknown) {
    const code = (err as Error & { statusCode?: number }).statusCode
    if (code === 404) return res.status(404).json({ error: (err as Error).message })
    if (code === 403) return res.status(403).json({ error: (err as Error).message })
    throw err
  }
}
