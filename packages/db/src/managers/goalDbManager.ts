import { prisma } from '../client.js'
import type { Goal, GoalType, GoalStatus, MovementPrType, LoadUnit, DistanceUnit } from '../client.js'
import { computeGoalCheckInStats } from './goalCheckInDbManager.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateGoalData {
  type: GoalType
  title: string
  targetDate?: Date | null
  movementId?: string | null
  namedWorkoutId?: string | null
  targetPrType?: MovementPrType | null
  targetValue?: number | null
  targetLoadUnit?: LoadUnit | null
  targetDistanceUnit?: DistanceUnit | null
  targetRepCount?: number | null
  frequencyPerWeek?: number | null
  frequencyWeeks?: number | null
  frequencyStartDate?: Date | null
}

export interface UpdateGoalData {
  title?: string
  targetDate?: Date | null
  status?: GoalStatus
}

// Computed progress for a Goal — discriminated by type so the UI can read
// type-specific fields without re-deriving them. Matches the GoalProgress
// shape exported from @wodalytics/types.
export type GoalProgress =
  | { type: 'PR_TARGET'; current: number | null; target: number; unit: string | null; percent: number; isComplete: boolean }
  | { type: 'FREQUENCY'; workoutsLogged: number; workoutsRequired: number; percent: number; weeksRemaining: number; currentWeekCount: number; isComplete: boolean }
  | {
      type: 'HABIT'
      currentStreak: number
      longestStreak: number
      totalCheckIns: number
      weekCheckIns: number
      last7Days: Array<{ date: string; checkedIn: boolean }>
      checkedInToday: boolean
    }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Goal rows are usually returned alongside the related Movement / NamedWorkout
// for display. This is the canonical include used by list + detail reads.
const goalInclude = {
  movement: { select: { id: true, name: true } },
  namedWorkout: { select: { id: true, name: true } },
} as const

export type GoalWithRelations = Goal & {
  movement: { id: string; name: string } | null
  namedWorkout: { id: string; name: string } | null
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createGoalForUser(userId: string, data: CreateGoalData): Promise<GoalWithRelations> {
  return prisma.goal.create({
    data: { userId, ...data },
    include: goalInclude,
  })
}

export async function findGoalById(goalId: string): Promise<GoalWithRelations | null> {
  return prisma.goal.findUnique({
    where: { id: goalId },
    include: goalInclude,
  })
}

interface FindGoalsOptions {
  status?: GoalStatus | GoalStatus[]
  limit?: number
}

export async function findGoalsForUser(userId: string, opts: FindGoalsOptions = {}): Promise<GoalWithRelations[]> {
  const where: { userId: string; status?: GoalStatus | { in: GoalStatus[] } } = { userId }
  if (opts.status !== undefined) {
    where.status = Array.isArray(opts.status) ? { in: opts.status } : opts.status
  }
  return prisma.goal.findMany({
    where,
    orderBy: [
      // ACTIVE first, then COMPLETED (newest first), then ARCHIVED
      { status: 'asc' },
      { createdAt: 'desc' },
    ],
    take: opts.limit,
    include: goalInclude,
  })
}

export async function findActiveGoalsForUser(userId: string, opts: { limit?: number } = {}): Promise<GoalWithRelations[]> {
  return findGoalsForUser(userId, { status: 'ACTIVE', limit: opts.limit })
}

// Ownership-scoped update. Throws an Error with `statusCode` 404 if the goal
// doesn't exist, 403 if it belongs to another user. Matches the
// updateResultByOwner pattern in resultDbManager.
export async function updateGoalByOwner(
  goalId: string,
  userId: string,
  data: UpdateGoalData,
): Promise<GoalWithRelations> {
  const existing = await prisma.goal.findUnique({ where: { id: goalId } })
  if (!existing) {
    throw Object.assign(new Error('Goal not found'), { statusCode: 404 })
  }
  if (existing.userId !== userId) {
    throw Object.assign(new Error('You do not own this goal'), { statusCode: 403 })
  }
  // Compute completedAt transitions: set to now when transitioning to COMPLETED,
  // clear when transitioning back to ACTIVE.
  const patch: UpdateGoalData & { completedAt?: Date | null } = { ...data }
  if (data.status !== undefined && data.status !== existing.status) {
    if (data.status === 'COMPLETED') patch.completedAt = new Date()
    else if (existing.status === 'COMPLETED') patch.completedAt = null
  }
  return prisma.goal.update({
    where: { id: goalId },
    data: patch,
    include: goalInclude,
  })
}

export async function deleteGoalByOwner(goalId: string, userId: string): Promise<void> {
  const existing = await prisma.goal.findUnique({ where: { id: goalId } })
  if (!existing) {
    throw Object.assign(new Error('Goal not found'), { statusCode: 404 })
  }
  if (existing.userId !== userId) {
    throw Object.assign(new Error('You do not own this goal'), { statusCode: 403 })
  }
  await prisma.goal.delete({ where: { id: goalId } })
}

// ─── Progress computation ────────────────────────────────────────────────────

// Display unit for PR-type progress when the goal doesn't carry an explicit
// unit enum (LOAD has LoadUnit, DISTANCE has DistanceUnit; TIME/MAX_REPS/
// CALORIES are unit-less in the column sense but the UI still labels them).
function defaultUnitForPrType(prType: MovementPrType | null): string | null {
  switch (prType) {
    case 'TIME': return 's'
    case 'MAX_REPS': return 'reps'
    case 'CALORIES': return 'cal'
    default: return null
  }
}

// Maps the goal's TargetPrType to BenchmarkResult.primaryScoreKind. The only
// mismatch is MAX_REPS → REPS — BenchmarkResult uses REPS for max-rep scoring
// to match how Result.primaryScoreKind is derived.
function benchmarkScoreKindForPrType(prType: MovementPrType): string {
  return prType === 'MAX_REPS' ? 'REPS' : prType
}

async function findBestBenchmarkScoreForUser(
  userId: string,
  namedWorkoutName: string,
  targetPrType: MovementPrType,
): Promise<number | null> {
  const ascending = targetPrType === 'TIME'
  const scoreKind = benchmarkScoreKindForPrType(targetPrType)
  const best = await prisma.benchmarkResult.findFirst({
    where: { userId, namedWorkoutName, primaryScoreKind: scoreKind },
    orderBy: { primaryScoreValue: ascending ? 'asc' : 'desc' },
    select: { primaryScoreValue: true },
  })
  return best?.primaryScoreValue ?? null
}

async function computePrTargetProgress(goal: Goal): Promise<GoalProgress> {
  const target = goal.targetValue ?? 0
  const ascending = goal.targetPrType === 'TIME'
  const unit = goal.targetLoadUnit ?? goal.targetDistanceUnit ?? defaultUnitForPrType(goal.targetPrType)

  let current: number | null = null

  if (goal.movementId && goal.targetPrType === 'LOAD' && goal.targetRepCount) {
    // LOAD goals against a Movement are the well-served path: MovementPR has
    // a row per (user, movement, repCount).
    const pr = await prisma.movementPR.findUnique({
      where: {
        userId_movementId_repCount: {
          userId: goal.userId,
          movementId: goal.movementId,
          repCount: goal.targetRepCount,
        },
      },
      select: { load: true },
    })
    current = pr?.load ?? null
  } else if (goal.namedWorkoutId && goal.targetPrType) {
    // Benchmark goals: best primaryScoreValue across BenchmarkResults.
    const nw = await prisma.namedWorkout.findUnique({
      where: { id: goal.namedWorkoutId },
      select: { name: true },
    })
    if (nw) {
      current = await findBestBenchmarkScoreForUser(goal.userId, nw.name, goal.targetPrType)
    }
  }
  // Non-LOAD movement goals: v1 leaves `current = null`. The UI shows
  // "Progress tracking coming soon for this PR type" and the user can
  // manually mark the goal complete. Adding a Result-row scan here is
  // deferred to a follow-up (#TBD).

  const percent =
    current === null
      ? 0
      : Math.min(100, Math.round(ascending ? (target / current) * 100 : (current / target) * 100))
  const isComplete = current !== null && (ascending ? current <= target : current >= target)

  return { type: 'PR_TARGET', current, target, unit, percent, isComplete }
}

async function computeFrequencyProgress(goal: Goal): Promise<GoalProgress> {
  const perWeek = goal.frequencyPerWeek ?? 0
  const totalWeeks = goal.frequencyWeeks ?? 0
  const workoutsRequired = perWeek * totalWeeks

  const start = goal.frequencyStartDate ?? goal.createdAt
  const startMs = start.getTime()
  const endMs = startMs + totalWeeks * WEEK_MS
  const end = new Date(endMs)
  const nowMs = Date.now()

  const workoutsLogged = await prisma.result.count({
    where: { userId: goal.userId, createdAt: { gte: start, lte: end } },
  })

  // Current-week bucket: floor((now - start) / 7d) gives the 0-indexed week.
  // Clamp to [0, totalWeeks - 1] so a window that has already ended still
  // reports the last week's count rather than negative-indexing.
  const rawWeek = Math.floor((nowMs - startMs) / WEEK_MS)
  const elapsedWeeks = Math.max(0, Math.min(rawWeek, totalWeeks - 1))
  const currentWeekStart = new Date(startMs + elapsedWeeks * WEEK_MS)
  const currentWeekEnd = new Date(currentWeekStart.getTime() + WEEK_MS)
  const currentWeekCount = await prisma.result.count({
    where: { userId: goal.userId, createdAt: { gte: currentWeekStart, lt: currentWeekEnd } },
  })

  const weeksRemaining = Math.max(0, totalWeeks - Math.max(0, Math.ceil((nowMs - startMs) / WEEK_MS)))
  const percent =
    workoutsRequired === 0 ? 0 : Math.min(100, Math.round((workoutsLogged / workoutsRequired) * 100))
  const isComplete = workoutsRequired > 0 && workoutsLogged >= workoutsRequired

  return {
    type: 'FREQUENCY',
    workoutsLogged,
    workoutsRequired,
    percent,
    weeksRemaining,
    currentWeekCount,
    isComplete,
  }
}

export async function computeGoalProgress(goal: Goal, now: Date = new Date()): Promise<GoalProgress> {
  if (goal.type === 'HABIT') {
    const stats = await computeGoalCheckInStats(goal.id, now)
    return { type: 'HABIT', ...stats }
  }
  if (goal.type === 'PR_TARGET') return computePrTargetProgress(goal)
  if (goal.type === 'FREQUENCY') return computeFrequencyProgress(goal)
  // Exhaustive — TypeScript will flag unhandled enum members.
  return {
    type: 'HABIT',
    currentStreak: 0,
    longestStreak: 0,
    totalCheckIns: 0,
    weekCheckIns: 0,
    last7Days: [],
    checkedInToday: false,
  }
}

// ─── Auto-detection hooks ─────────────────────────────────────────────────────
//
// Called from the route handlers (or upstream manager functions) that have
// just written a Result / BenchmarkResult. Bulk-flips matching ACTIVE goals
// to COMPLETED. Returns the count completed so the caller can surface a
// celebration toast on the response.

// Called after detectAndUpsertStrengthPrs has upserted a new MovementPR.
// Flips every ACTIVE LOAD goal on this (user, movement, repCount) whose
// target is now met.
export async function detectAndCompleteMovementPRGoals(
  userId: string,
  movementId: string,
  achievedLoad: number,
  achievedRepCount: number,
): Promise<number> {
  const result = await prisma.goal.updateMany({
    where: {
      userId,
      type: 'PR_TARGET',
      status: 'ACTIVE',
      movementId,
      targetPrType: 'LOAD',
      targetRepCount: achievedRepCount,
      targetValue: { lte: achievedLoad },
    },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  return result.count
}

// Called after a BenchmarkResult is written. Flips every ACTIVE goal on this
// (user, namedWorkout) whose targetPrType matches the score kind and target
// is now met (direction-aware: TIME goals complete when achieved <= target).
export async function detectAndCompleteBenchmarkGoals(
  userId: string,
  namedWorkoutId: string,
  primaryScoreKind: string | null,
  primaryScoreValue: number | null,
): Promise<number> {
  if (primaryScoreKind === null || primaryScoreValue === null) return 0

  // Map BenchmarkResult kind back to the goal's targetPrType.
  const targetPrType: MovementPrType | null =
    primaryScoreKind === 'REPS'
      ? 'MAX_REPS'
      : ['LOAD', 'TIME', 'DISTANCE', 'CALORIES'].includes(primaryScoreKind)
        ? (primaryScoreKind as MovementPrType)
        : null
  if (targetPrType === null) return 0

  const isTime = targetPrType === 'TIME'
  const targetCondition = isTime
    ? { targetValue: { gte: primaryScoreValue } }
    : { targetValue: { lte: primaryScoreValue } }

  const result = await prisma.goal.updateMany({
    where: {
      userId,
      type: 'PR_TARGET',
      status: 'ACTIVE',
      namedWorkoutId,
      targetPrType,
      ...targetCondition,
    },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })
  return result.count
}

// Called after any Result write. Re-evaluates every ACTIVE frequency goal for
// this user and completes the ones whose target has been met. Cheap when no
// frequency goals exist (the findMany returns []).
export async function detectAndCompleteFrequencyGoals(userId: string): Promise<number> {
  const goals = await prisma.goal.findMany({
    where: { userId, type: 'FREQUENCY', status: 'ACTIVE' },
  })
  if (goals.length === 0) return 0

  let completed = 0
  for (const goal of goals) {
    const progress = await computeFrequencyProgress(goal)
    if (progress.type === 'FREQUENCY' && progress.isComplete) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })
      completed++
    }
  }
  return completed
}
