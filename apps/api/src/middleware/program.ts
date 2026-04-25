import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@berntracker/db'
import { findProgramWithGymIds } from '../db/programDbManager.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('program')

const writeAccessRoles: Role[] = ['OWNER', 'PROGRAMMER', 'COACH']

async function loadProgramAndUserRoles(
  req: Request,
  res: Response,
): Promise<{ gymIds: string[]; roles: Role[] } | null> {
  const programId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  const program = await findProgramWithGymIds(programId)
  if (!program) {
    res.status(404).json({ error: 'Program not found' })
    return null
  }
  const gymIds = program.gyms.map((g) => g.gymId)
  if (gymIds.length === 0) {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const memberships = await Promise.all(
    gymIds.map((gymId) => findGymMembershipByUserAndGym(userId, gymId)),
  )
  const roles = memberships
    .map((m) => m?.role)
    .filter((r): r is Role => Boolean(r))
  return { gymIds, roles }
}

/** Requires the authenticated user to be a member (any role) of any gym linked to the program in :id. */
export async function requireProgramGymMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = await loadProgramAndUserRoles(req, res)
  if (!ctx) return
  if (ctx.roles.length === 0) {
    log.warning(req, `requireProgramGymMembership: not a member of any linked gym — ${req.method} ${req.path} — userId=${req.user?.id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to have OWNER/PROGRAMMER/COACH role in any gym linked to the program in :id. */
export async function requireProgramGymWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = await loadProgramAndUserRoles(req, res)
  if (!ctx) return
  if (!ctx.roles.some((r) => writeAccessRoles.includes(r))) {
    log.warning(req, `requireProgramGymWriteAccess: insufficient role — ${req.method} ${req.path} — userId=${req.user?.id} roles=${ctx.roles.join('|') || 'none'}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to have OWNER role in any gym linked to the program in :id. */
export async function requireProgramGymOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ctx = await loadProgramAndUserRoles(req, res)
  if (!ctx) return
  if (!ctx.roles.includes('OWNER')) {
    log.warning(req, `requireProgramGymOwner: OWNER role required — ${req.method} ${req.path} — userId=${req.user?.id} roles=${ctx.roles.join('|') || 'none'}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
