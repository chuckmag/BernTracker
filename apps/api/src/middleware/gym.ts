import type { Request, Response, NextFunction } from 'express'
import { findGymById } from '../db/gymDbManager.js'
import { isUserMemberOfAnyGym } from '../db/userGymDbManager.js'
import { prisma } from '@berntracker/db'

export async function validateGymExists(req: Request, res: Response, next: NextFunction): Promise<void> {
  const gymId = req.params.gymId as string
  const gym = await findGymById(gymId)
  if (!gym) {
    res.status(404).json({ error: 'Gym not found' })
    return
  }
  next()
}

export async function requireGymMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const gymId = req.params.gymId as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const membership = await prisma.userGym.findUnique({
    where: { userId_gymId: { userId, gymId } },
  })
  if (!membership) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export async function requireWorkoutGymMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workoutId = req.params.id as string
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { program: { select: { gyms: { select: { gymId: true } } } } },
  })
  if (!workout) {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  const gymIds = workout.program?.gyms.map((g) => g.gymId) ?? []
  const isMember = await isUserMemberOfAnyGym(userId, gymIds)
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
