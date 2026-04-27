import { Router } from 'express'
import type { Request, Response } from 'express'
import { ProgramRole, Prisma } from '@wodalytics/db'
import {
  CreateProgramSchema,
  UpdateProgramSchema,
  InviteProgramMemberSchema,
} from '@wodalytics/types'
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
  requireProgramGymManager,
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
import {
  findGymMembershipByUserAndGym,
  findGymMemberByEmail,
} from '../db/userGymDbManager.js'
import {
  findProgramById,
  subscribeUserToProgram,
  unsubscribeUserFromProgram,
  createUserProgramSubscription,
  findProgramMembersWithUserInfo,
  findProgramsAvailableToUserInGym,
} from '../db/userProgramDbManager.js'

const STAFF_ROLES = ['OWNER', 'PROGRAMMER', 'COACH'] as const

const router = Router()

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET  /api/me/programs?gymId=…  — caller's available programs (slice 3).
//        Staff sees every gym program; MEMBER sees only their subscriptions.
//        Drives the sidebar ProgramFilterPicker so members never see programs
//        they were never invited to.
router.get('/me/programs', requireAuth, listMyProgramsInGym)

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

// GET    /api/programs/:id/members  — list subscribers (slice 3)
router.get('/programs/:id/members', requireAuth, requireProgramGymWriteAccess, listProgramMembers)

// POST   /api/programs/:id/members  — invite a gym member onto the program (slice 3)
router.post('/programs/:id/members', requireAuth, requireProgramGymManager, inviteProgramMember)

// DELETE /api/programs/:id/members/:userId  — remove a member's subscription (slice 3)
router.delete('/programs/:id/members/:userId', requireAuth, requireProgramGymManager, removeProgramMember)

// POST   /api/programs/:id/subscribe  — used by the gym-level Members page (per-member view).
//        Predates slice 3's cleaner /members routes; left in place so the existing UI keeps working.
router.post('/programs/:id/subscribe', subscribeToProgram)

// DELETE /api/programs/:id/subscribe  — see note above
router.delete('/programs/:id/subscribe', unsubscribeFromProgram)

export default router

// ─── Handler functions ────────────────────────────────────────────────────────

async function listProgramsForGym(req: Request, res: Response) {
  const gymPrograms = await findProgramsWithDetailsByGymId(req.params.gymId as string)
  res.json(gymPrograms)
}

async function listMyProgramsInGym(req: Request, res: Response) {
  const userId = req.user!.id
  const gymId = typeof req.query.gymId === 'string' ? req.query.gymId : undefined
  if (!gymId) return res.status(400).json({ error: 'Query param gymId is required' })
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (!membership) return res.status(403).json({ error: 'Forbidden' })
  const isStaff = (STAFF_ROLES as readonly string[]).includes(membership.role)
  const rows = await findProgramsAvailableToUserInGym(userId, gymId, isStaff)
  res.json(rows)
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

async function listProgramMembers(req: Request, res: Response) {
  const programId = req.params.id as string
  const rows = await findProgramMembersWithUserInfo(programId)
  res.json(rows.map((r) => ({
    id: r.user.id,
    email: r.user.email,
    name: r.user.name,
    role: r.role,
    joinedAt: r.joinedAt,
  })))
}

async function inviteProgramMember(req: Request, res: Response) {
  const programId = req.params.id as string
  const parsed = InviteProgramMemberSchema.safeParse(req.body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] ?? 'request'
    const message = issue?.message ?? 'Invalid request'
    return res.status(400).json({ error: `${field}: ${message}` })
  }

  // The program is linked to one or more gyms (via the middleware ctx). For
  // email lookup we need the canonical gym for this program — same approach
  // as getProgramById: walk the linked gyms, prefer one the operator belongs
  // to. With slice-3 scope (no cross-gym programs in practice) all linked
  // gyms collapse to the same id.
  const program = await findProgramWithGymIds(programId)
  if (!program) return res.status(404).json({ error: 'Program not found' })

  let targetUserId = parsed.data.userId ?? null
  if (!targetUserId && parsed.data.email) {
    const user = await findUserGymMemberAcrossLinkedGyms(parsed.data.email, program.gyms.map((g) => g.gymId))
    if (!user) return res.status(404).json({ error: 'No gym member found for that email' })
    targetUserId = user.id
  }
  if (!targetUserId) return res.status(400).json({ error: 'Either userId or email is required' })

  // Verify the target user actually belongs to one of the program's gyms —
  // prevents inviting a user from another gym via raw userId.
  const userIsGymMember = await isUserMemberOfAnyGym(targetUserId, program.gyms.map((g) => g.gymId))
  if (!userIsGymMember) {
    return res.status(404).json({ error: 'No gym member found for that user' })
  }

  const role = parsed.data.role === 'PROGRAMMER' ? ProgramRole.PROGRAMMER : ProgramRole.MEMBER
  try {
    const created = await createUserProgramSubscription(targetUserId, programId, role)
    res.status(201).json({
      programId,
      userId: created.userId,
      role: created.role,
      joinedAt: created.joinedAt,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ error: 'Already a member' })
    }
    throw err
  }
}

async function removeProgramMember(req: Request, res: Response) {
  const programId = req.params.id as string
  const userId = req.params.userId as string
  try {
    await unsubscribeUserFromProgram(userId, programId)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ error: 'Membership not found' })
    }
    throw err
  }
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

async function findUserGymMemberAcrossLinkedGyms(email: string, gymIds: string[]) {
  for (const gymId of gymIds) {
    const user = await findGymMemberByEmail(email, gymId)
    if (user) return user
  }
  return null
}

async function isUserMemberOfAnyGym(userId: string, gymIds: string[]): Promise<boolean> {
  for (const gymId of gymIds) {
    const m = await findGymMembershipByUserAndGym(userId, gymId)
    if (m) return true
  }
  return false
}
