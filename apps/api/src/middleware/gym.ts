import type { Request, Response, NextFunction } from 'express'
import { findGymById } from '../db/gymDbManager.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { findWorkoutProgramId } from '../db/workoutDbManager.js'
import { findUserProgramMembership } from '../db/userProgramDbManager.js'

const writeAccessRoles = ['OWNER', 'PROGRAMMER', 'COACH'];

function checkMembershipHasWriteAccessRoles(membership: any): boolean {
  const hasWriteAccessRoles = membership && writeAccessRoles.includes(membership.role)
  return hasWriteAccessRoles
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

/** Requires the authenticated user to have any UserProgram subscription for the workout's program (read access). */
export async function requireWorkoutProgramMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workoutId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const workout = await findWorkoutProgramId(workoutId)
  if (!workout) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!workout.programId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const membership = await findUserProgramMembership(userId, workout.programId)
  if (!membership) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to have PROGRAMMER role in the workout's program (write access). */
export async function requireWorkoutProgramWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workoutId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const workout = await findWorkoutProgramId(workoutId)
  if (!workout) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!workout.programId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const membership = await findUserProgramMembership(userId, workout.programId)
  if (!checkMembershipHasWriteAccessRoles(membership)) {
    console.log("Membership does not have write access roles:", membership)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
