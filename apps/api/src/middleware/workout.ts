import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@wodalytics/db'
import { ProgramRole } from '@wodalytics/db'
import { findWorkoutWithProgramGyms } from '../db/workoutDbManager.js'
import { findGymMembershipByUserAndGym } from '../db/userGymDbManager.js'
import { findUserProgramMembership } from '../db/userProgramDbManager.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('workout')

const writeGymRoles: Role[] = ['OWNER', 'PROGRAMMER', 'COACH']

// Authorization for /api/workouts/:id is derived from the workout's program.
// A program is either gym-linked (one or more `GymProgram` rows) or unaffiliated
// (no `GymProgram` rows — e.g. the public CrossFit Mainsite program seeded by
// the ingest job). The two cases need different gates:
//
//   gym-linked    → read  = any UserGym membership in any linked gym
//                          OR any UserProgram row (subscriber);
//                   write = OWNER/PROGRAMMER/COACH in any linked gym.
//                          UserProgram never grants write here — staff who
//                          created the program have no automatic subscription
//                          row, and a subscription role is a feed-visibility
//                          marker, not a staff-write gate.
//   unaffiliated  → read  = any UserProgram row;
//                   write = UserProgram.role = PROGRAMMER.
export type AccessContext =
  | { kind: 'not-found' }
  | { kind: 'no-program' }
  | { kind: 'gym-linked'; gymRoles: Role[]; programRole: ProgramRole | null }
  | { kind: 'unaffiliated'; programRole: ProgramRole | null }

/**
 * Pure boolean form of `requireWorkoutWriteAccess` — same gates, no Express.
 * Read-access route handlers use this to project a `canEdit` field into the
 * workout response so clients can show/hide editor affordances without a
 * second HTTP round-trip (#242 slice 2b).
 */
export function hasWorkoutWriteAccess(ctx: AccessContext): boolean {
  if (ctx.kind === 'gym-linked') return ctx.gymRoles.some((r) => writeGymRoles.includes(r))
  if (ctx.kind === 'unaffiliated') return ctx.programRole === ProgramRole.PROGRAMMER
  return false
}

export async function loadWorkoutAccess(workoutId: string, userId: string): Promise<AccessContext> {
  const workout = await findWorkoutWithProgramGyms(workoutId)
  if (!workout) return { kind: 'not-found' }
  if (!workout.programId || !workout.program) return { kind: 'no-program' }

  const gymIds = workout.program.gyms.map((g) => g.gymId)
  if (gymIds.length > 0) {
    const [memberships, sub] = await Promise.all([
      Promise.all(gymIds.map((gymId) => findGymMembershipByUserAndGym(userId, gymId))),
      findUserProgramMembership(userId, workout.programId),
    ])
    const gymRoles = memberships
      .map((m) => m?.role)
      .filter((r): r is Role => Boolean(r))
    return { kind: 'gym-linked', gymRoles, programRole: sub?.role ?? null }
  }

  const sub = await findUserProgramMembership(userId, workout.programId)
  return { kind: 'unaffiliated', programRole: sub?.role ?? null }
}

/** Read access to a workout in `:id`. See AccessContext above for the rule. */
export async function requireWorkoutReadAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const ctx = await loadWorkoutAccess(req.params.id as string, userId)

  if (ctx.kind === 'not-found') {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (ctx.kind === 'no-program') {
    log.warning(req, `requireWorkoutReadAccess: workout has no program — ${req.method} ${req.path} — userId=${userId}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (ctx.kind === 'gym-linked') {
    if (ctx.gymRoles.length === 0 && !ctx.programRole) {
      log.warning(req, `requireWorkoutReadAccess: not a member of any linked gym and not a subscriber — ${req.method} ${req.path} — userId=${userId}`)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
    return
  }
  if (!ctx.programRole) {
    log.warning(req, `requireWorkoutReadAccess: no UserProgram for unaffiliated program — ${req.method} ${req.path} — userId=${userId}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/** Write access to a workout in `:id`. See AccessContext above for the rule. */
export async function requireWorkoutWriteAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const ctx = await loadWorkoutAccess(req.params.id as string, userId)

  if (ctx.kind === 'not-found') {
    res.status(404).json({ error: 'Workout not found' })
    return
  }
  if (ctx.kind === 'no-program') {
    log.warning(req, `requireWorkoutWriteAccess: workout has no program — ${req.method} ${req.path} — userId=${userId}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  if (ctx.kind === 'gym-linked') {
    if (!ctx.gymRoles.some((r) => writeGymRoles.includes(r))) {
      log.warning(req, `requireWorkoutWriteAccess: insufficient gym role — ${req.method} ${req.path} — userId=${userId} roles=${ctx.gymRoles.join('|') || 'none'}`)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
    return
  }
  if (ctx.programRole !== ProgramRole.PROGRAMMER) {
    log.warning(req, `requireWorkoutWriteAccess: unaffiliated program requires UserProgram.PROGRAMMER — ${req.method} ${req.path} — userId=${userId} role=${ctx.programRole ?? 'none'}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
