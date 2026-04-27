import type { Request, Response, NextFunction } from 'express'
import { findGymById } from '../db/gymDbManager.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'

const writeAccessRoles = ['OWNER', 'PROGRAMMER', 'COACH']

function checkMembershipHasWriteAccessRoles(membership: any): boolean {
  return Boolean(membership) && writeAccessRoles.includes(membership.role)
}

export async function validateGymExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  const gymId = req.params.gymId as string
  const gym = await findGymById(gymId)
  if (!gym) {
    res.status(404).json({ error: 'Gym not found' })
    return
  }
  next()
}

/** Requires the authenticated user to be a member of the gym in :gymId (any role). */
export async function requireGymMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const gymId = req.params.gymId as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (!membership) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to have OWNER, PROGRAMMER, or COACH role in the gym in :gymId. */
export async function requireGymWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const gymId = req.params.gymId as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const membership = await findGymMembershipByUserAndGym(userId, gymId)
  if (!checkMembershipHasWriteAccessRoles(membership)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

// Workout-scoped auth lives in `middleware/workout.ts` — see
// `requireWorkoutReadAccess` / `requireWorkoutWriteAccess`.
