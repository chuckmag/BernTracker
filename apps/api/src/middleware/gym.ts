import type { Request, Response, NextFunction } from 'express'
import { findGymById } from '../db/gymDbManager.js'
import {
  findGymMembershipByUserAndGym,
  findWriterMembershipByUserAndAnyGym,
  isUserMemberOfAnyGym,
} from '../db/userGymDbManager.js'
import { findWorkoutGymIdsById } from '../db/workoutDbManager.js'

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
  if (!membership || !['OWNER', 'PROGRAMMER', 'COACH'].includes(membership.role)) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to be a member of the gym that owns the workout in :id (any role). */
export async function requireWorkoutGymMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workoutId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const workout = await findWorkoutGymIdsById(workoutId)
  if (!workout) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!workout.program) {
    // Workouts without a program are out of scope for this access model
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const gymIds = workout.program.gyms.map((g) => g.gymId)
  const isMember = await isUserMemberOfAnyGym(userId, gymIds)
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Requires the authenticated user to have OWNER, PROGRAMMER, or COACH role in the gym that owns the workout in :id. */
export async function requireWorkoutGymWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workoutId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const workout = await findWorkoutGymIdsById(workoutId)
  if (!workout) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (!workout.program) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const gymIds = workout.program.gyms.map((g) => g.gymId)
  const membership = await findWriterMembershipByUserAndAnyGym(userId, gymIds)
  if (!membership) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
