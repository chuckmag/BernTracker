import { Router } from 'express'
import type { Request, Response } from 'express'
import { ProgramRole } from '@berntracker/db'
import { CreateProgramSchema, UpdateProgramSchema } from '@berntracker/types'
import { requireAuth } from '../middleware/auth.js'
import {
  validateGymExists,
  requireGymMembership,
  requireGymWriteAccess,
} from '../middleware/gym.js'
import {
  requireProgramGymMembership,
  requireProgramGymWriteAccess,
  requireProgramGymOwner,
} from '../middleware/program.js'
import {
  findProgramsWithDetailsByGymId,
  findProgramWithDetailsByIdAndGymId,
  createProgramAndLinkToGym,
} from '../db/gymProgramDbManager.js'
import {
  findProgramWithGymIds,
  updateProgramById,
  deleteProgramById,
} from '../db/programDbManager.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import {
  findProgramById,
  subscribeUserToProgram,
  unsubscribeUserFromProgram,
} from '../db/userProgramDbManager.js'

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/gyms/:gymId/programs
router.get('/gyms/:gymId/programs', requireAuth, validateGymExists, requireGymMembership, listProgramsForGym)

// POST /api/gyms/:gymId/programs
router.post('/gyms/:gymId/programs', requireAuth, validateGymExists, requireGymWriteAccess, createProgramForGym)

// GET    /api/programs/:id
router.get('/programs/:id', requireAuth, requireProgramGymMembership, getProgramById)

// PATCH  /api/programs/:id
router.patch('/programs/:id', requireAuth, requireProgramGymWriteAccess, patchProgram)

// DELETE /api/programs/:id
router.delete('/programs/:id', requireAuth, requireProgramGymOwner, deleteProgram)

// POST   /api/programs/:id/subscribe  — used by existing Members page, will be reworked in Slice 3
router.post('/programs/:id/subscribe', subscribeToProgram)

// DELETE /api/programs/:id/subscribe  — used by existing Members page, will be reworked in Slice 3
router.delete('/programs/:id/subscribe', unsubscribeFromProgram)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listProgramsForGym(req: Request, res: Response) {
  const gymPrograms = await findProgramsWithDetailsByGymId(req.params.gymId as string)
  res.json(gymPrograms)
}

async function createProgramForGym(req: Request, res: Response) {
  const parsed = CreateProgramSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const gymId = req.params.gymId as string
  const result = await createProgramAndLinkToGym(gymId, parsed.data)
  res.status(201).json(result)
}

async function getProgramById(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.user!.id

  // Find a GymProgram row for any gym the caller belongs to — the shape returned
  // matches the list endpoint so the detail page can reuse the same type.
  const program = await prismaFindDetailForCaller(programId, userId)
  if (!program) return res.status(404).json({ error: 'Program not found' })
  res.json(program)
}

async function patchProgram(req: Request, res: Response) {
  const parsed = UpdateProgramSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  const { name, description, startDate, endDate, coverColor } = parsed.data
  const program = await updateProgramById(req.params.id as string, {
    name,
    description,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate === null ? null : endDate ? new Date(endDate) : undefined,
    coverColor,
  })
  res.json(program)
}

async function deleteProgram(req: Request, res: Response) {
  await deleteProgramById(req.params.id as string)
  res.status(204).send()
}

async function subscribeToProgram(req: Request, res: Response) {
  const { userId, role } = req.body as { userId: string; role?: 'MEMBER' | 'PROGRAMMER' }
  const program = await findProgramById(req.params.id as string)
  if (!program) return res.status(404).json({ error: 'Program not found' })

  const programRole = role === 'PROGRAMMER' ? ProgramRole.PROGRAMMER : ProgramRole.MEMBER
  const userProgram = await subscribeUserToProgram(userId, req.params.id as string, programRole)
  res.status(201).json(userProgram)
}

async function unsubscribeFromProgram(req: Request, res: Response) {
  const { userId } = req.body as { userId: string }
  await unsubscribeUserFromProgram(userId, req.params.id as string)
  res.status(204).send()
}

// ── Local helpers ─────────────────────────────────────────────────────────────

// For GET /api/programs/:id we return the GymProgram-shaped detail for the first
// gym the caller belongs to that is linked to this program. Same shape as the
// list endpoint so the detail page can reuse the response type.
async function prismaFindDetailForCaller(programId: string, userId: string) {
  const program = await findProgramWithGymIds(programId)
  if (!program) return null
  for (const { gymId } of program.gyms) {
    const membership = await findGymMembershipByUserAndGym(userId, gymId)
    if (membership) {
      const detail = await findProgramWithDetailsByIdAndGymId(programId, gymId)
      if (detail) return detail
    }
  }
  return null
}
