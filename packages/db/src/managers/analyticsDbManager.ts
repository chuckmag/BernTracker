import { prisma } from '../client.js'
import type { MovementCategory, MovementPrType, Prisma } from '../client.js'
import { extractMovementSets, parseRepsToInt } from './resultDbManager.js'

export interface ConsistencyData {
  currentStreak: number
  longestStreak: number
  history: { date: string; count: number }[]
}

export async function getConsistencyDataForUser(userId: string, weeks: number): Promise<ConsistencyData> {
  const now = new Date()
  // End at end-of-day today UTC
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - weeks * 7 + 1)
  startDate.setUTCHours(0, 0, 0, 0)

  const results = await prisma.result.findMany({
    where: { userId, createdAt: { gte: startDate, lte: endDate } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // Group into YYYY-MM-DD buckets (UTC calendar date)
  const countByDate: Record<string, number> = {}
  for (const r of results) {
    const d = r.createdAt
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    countByDate[key] = (countByDate[key] ?? 0) + 1
  }

  const history = Object.entries(countByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  const { currentStreak, longestStreak } = computeStreaks(countByDate, now)

  return { currentStreak, longestStreak, history }
}

function toUtcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function computeStreaks(
  countByDate: Record<string, number>,
  now: Date,
): { currentStreak: number; longestStreak: number } {
  const todayKey = toUtcDateKey(now)
  const yesterdayDate = new Date(now)
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
  const yesterdayKey = toUtcDateKey(yesterdayDate)

  // Sort all dates with activity descending for current-streak walk
  const activeDates = new Set(Object.keys(countByDate))

  // Current streak: walk backwards from today (or yesterday if today has no results)
  let currentStreak = 0
  const startKey = activeDates.has(todayKey) ? todayKey : yesterdayKey
  if (activeDates.has(startKey)) {
    const cursor = new Date(startKey + 'T00:00:00Z')
    while (activeDates.has(toUtcDateKey(cursor))) {
      currentStreak++
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }
  }

  // Longest streak: walk all active dates sorted ascending
  const sortedDates = [...activeDates].sort()
  let longestStreak = 0
  let runStreak = 0
  let prevDate: Date | null = null
  for (const key of sortedDates) {
    const d = new Date(key + 'T00:00:00Z')
    if (prevDate !== null) {
      const diffMs = d.getTime() - prevDate.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      if (diffDays === 1) {
        runStreak++
      } else {
        runStreak = 1
      }
    } else {
      runStreak = 1
    }
    if (runStreak > longestStreak) longestStreak = runStreak
    prevDate = d
  }

  return { currentStreak, longestStreak }
}

// ─── Strength PR trajectory ────────────────────────────────────────────────────

export interface TrackedMovement {
  movementId: string
  name: string
  count: number
}

// e1RM percentages kept server-side only for determining which result "wins" a date bucket
const E1RM_PCT: Record<number, number> = {
  1: 1.00, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
}

function bestE1RMForBucket(sets: { reps?: string; load?: number }[]): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (s.load === undefined || !s.reps) continue
    const r = parseInt(s.reps, 10)
    const pct = E1RM_PCT[r]
    if (!pct) continue
    const e1rm = s.load / pct
    if (best === null || e1rm > best) best = e1rm
  }
  return best
}

export interface StrengthTrajectoryPoint {
  date: string
  maxLoad: number
  loadUnit: string
  sets: { reps?: string; load?: number }[]
  workoutId: string
  resultId: string
}

export interface StrengthTrajectoryData {
  movementId: string
  name: string
  currentPr: number | null
  loadUnit: string | null
  points: StrengthTrajectoryPoint[]
}

type TrajectoryRange = '1M' | '3M' | '6M' | '1Y'

function rangeToDays(range: TrajectoryRange): number {
  switch (range) {
    case '1M': return 30
    case '3M': return 90
    case '6M': return 180
    case '1Y': return 365
  }
}

export async function getTopStrengthMovementsForUser(
  userId: string,
  days = 60,
  limit = 5,
): Promise<TrackedMovement[]> {
  const startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() - days)
  startDate.setUTCHours(0, 0, 0, 0)

  const results = await prisma.result.findMany({
    where: { userId, createdAt: { gte: startDate } },
    select: {
      value: true,
      workout: {
        select: {
          workoutMovements: {
            select: {
              movement: { select: { id: true, name: true, category: true } },
            },
          },
        },
      },
    },
  })

  const countByMovement = new Map<string, { name: string; count: number }>()
  for (const result of results) {
    const seen = new Set<string>()
    for (const wm of result.workout.workoutMovements) {
      if (wm.movement.category !== 'STRENGTH') continue
      if (seen.has(wm.movement.id)) continue
      seen.add(wm.movement.id)
      const existing = countByMovement.get(wm.movement.id)
      countByMovement.set(wm.movement.id, {
        name: wm.movement.name,
        count: (existing?.count ?? 0) + 1,
      })
    }
  }

  return [...countByMovement.entries()]
    .map(([movementId, { name, count }]) => ({ movementId, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getStrengthPRTrajectoryForUser(
  userId: string,
  movementId: string,
  range: TrajectoryRange,
): Promise<StrengthTrajectoryData> {
  const movement = await prisma.movement.findUnique({
    where: { id: movementId },
    select: { id: true, name: true, category: true },
  })
  if (!movement || movement.category !== 'STRENGTH') {
    return { movementId, name: movement?.name ?? '', currentPr: null, loadUnit: null, points: [] }
  }

  const startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() - rangeToDays(range))
  startDate.setUTCHours(0, 0, 0, 0)

  const results = await prisma.result.findMany({
    where: {
      userId,
      createdAt: { gte: startDate },
      workout: { workoutMovements: { some: { movementId } } },
    },
    select: {
      id: true,
      value: true,
      workout: { select: { id: true, scheduledAt: true } },
    },
  })

  // Aggregate the best-e1RM result per scheduledAt UTC date; ship raw sets so
  // the client can run the shared e1rm lib directly, matching the movement history chart.
  const byDate = new Map<string, {
    maxLoad: number; loadUnit: string
    sets: { reps?: string; load?: number }[]
    workoutId: string; resultId: string
  }>()
  let currentPr: number | null = null
  let latestUnit: string | null = null

  for (const result of results) {
    const { sets, loadUnit: unit } = extractMovementSets(result.value, movementId)
    const setsWithLoad = sets.filter((s) => s.load !== undefined && s.load > 0)
    if (!setsWithLoad.length) continue

    const maxLoad = Math.max(...setsWithLoad.map((s) => s.load!))
    const dateKey = toUtcDateKey(result.workout.scheduledAt)
    const u = unit ?? 'LB'
    if (latestUnit === null) latestUnit = u

    // Keep the result with the best e1RM for this date (fall back to max load)
    const existing = byDate.get(dateKey)
    const thisE1rm = bestE1RMForBucket(setsWithLoad)
    const existingE1rm = existing ? bestE1RMForBucket(existing.sets) : null
    const betterThanExisting =
      !existing ||
      (thisE1rm !== null && (existingE1rm === null || thisE1rm > existingE1rm)) ||
      (thisE1rm === null && existingE1rm === null && maxLoad > existing.maxLoad)

    if (betterThanExisting) {
      byDate.set(dateKey, { maxLoad, loadUnit: u, sets: setsWithLoad, workoutId: result.workout.id, resultId: result.id })
    }
    if (currentPr === null || maxLoad > currentPr) currentPr = maxLoad
  }

  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { maxLoad, loadUnit, sets, workoutId, resultId }]) => ({ date, maxLoad, loadUnit, sets, workoutId, resultId }))

  return { movementId, name: movement.name, currentPr, loadUnit: latestUnit, points }
}

// ─── Movements analytics (issue #366) ────────────────────────────────────────

type ResultForPr = {
  id: string
  value: Prisma.JsonValue
  workout: { id: string; title: string; scheduledAt: Date }
}

type MovementDisplayGroup = 'strength' | 'monostructural' | 'gymnastics'

function toDisplayGroup(category: MovementCategory): MovementDisplayGroup | null {
  if (category === 'STRENGTH') return 'strength'
  if (category === 'GYMNASTICS') return 'gymnastics'
  if (category === 'MONOSTRUCTURAL' || category === 'ENDURANCE' || category === 'MACHINE') return 'monostructural'
  return null
}

type PrimaryPR =
  | { type: 'LOAD'; reps: number; load: number; loadUnit: string; achievedAt: string }
  | { type: 'MAX_REPS'; maxReps: number; achievedAt: string }
  | { type: 'TIME'; distance: number; distanceUnit: string; seconds: number; achievedAt: string }
  | { type: 'DISTANCE'; seconds: number; distance: number; distanceUnit: string; achievedAt: string }
  | { type: 'CALORIES'; seconds: number; calories: number; achievedAt: string }

function computePrimaryPr(prType: MovementPrType, movementId: string, results: ResultForPr[]): PrimaryPR | null {
  switch (prType) {
    case 'LOAD': {
      let bestLoad: number | null = null
      let bestReps = 0
      let bestLoadUnit = 'LB'
      let bestAchievedAt = ''
      for (const r of results) {
        const { sets, loadUnit } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (!set.reps || set.load === undefined || set.load <= 0) continue
          const repCount = parseRepsToInt(set.reps)
          if (repCount <= 0) continue
          if (bestLoad === null || set.load > bestLoad || (set.load === bestLoad && repCount < bestReps)) {
            bestLoad = set.load
            bestReps = repCount
            bestLoadUnit = loadUnit ?? 'LB'
            bestAchievedAt = r.workout.scheduledAt.toISOString()
          }
        }
      }
      return bestLoad !== null ? { type: 'LOAD', reps: bestReps, load: bestLoad, loadUnit: bestLoadUnit, achievedAt: bestAchievedAt } : null
    }
    case 'MAX_REPS': {
      let best: { maxReps: number; achievedAt: string } | null = null
      for (const r of results) {
        const { sets } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (!set.reps) continue
          const reps = parseRepsToInt(set.reps)
          if (reps <= 0) continue
          if (!best || reps > best.maxReps) {
            best = { maxReps: reps, achievedAt: r.workout.scheduledAt.toISOString() }
          }
        }
      }
      return best ? { type: 'MAX_REPS', ...best } : null
    }
    case 'TIME': {
      let best: { distance: number; distanceUnit: string; seconds: number; achievedAt: string } | null = null
      for (const r of results) {
        const { sets, distanceUnit } = extractMovementSets(r.value, movementId)
        const unit = distanceUnit ?? 'M'
        for (const set of sets) {
          if (set.distance === undefined || !set.seconds) continue
          if (!best || set.seconds < best.seconds) {
            best = { distance: set.distance, distanceUnit: unit, seconds: set.seconds, achievedAt: r.workout.scheduledAt.toISOString() }
          }
        }
      }
      return best ? { type: 'TIME', ...best } : null
    }
    case 'DISTANCE': {
      let best: { seconds: number; distance: number; distanceUnit: string; achievedAt: string } | null = null
      for (const r of results) {
        const { sets, distanceUnit } = extractMovementSets(r.value, movementId)
        const unit = distanceUnit ?? 'M'
        for (const set of sets) {
          if (set.distance === undefined || !set.seconds) continue
          if (!best || set.distance > best.distance) {
            best = { seconds: set.seconds, distance: set.distance, distanceUnit: unit, achievedAt: r.workout.scheduledAt.toISOString() }
          }
        }
      }
      return best ? { type: 'DISTANCE', ...best } : null
    }
    case 'CALORIES': {
      let best: { seconds: number; calories: number; achievedAt: string } | null = null
      for (const r of results) {
        const { sets } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (set.calories === undefined || !set.seconds) continue
          if (!best || set.calories > best.calories) {
            best = { seconds: set.seconds, calories: set.calories, achievedAt: r.workout.scheduledAt.toISOString() }
          }
        }
      }
      return best ? { type: 'CALORIES', ...best } : null
    }
    case 'NONE':
      return null
  }
}

function computePrEntries(prType: MovementPrType, movementId: string, results: ResultForPr[]) {
  switch (prType) {
    case 'LOAD': {
      const byReps = new Map<number, { load: number; loadUnit: string; achievedAt: string; resultId: string; workoutId: string }>()
      for (const r of results) {
        const { sets, loadUnit } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (!set.reps || set.load === undefined || set.load <= 0) continue
          const repCount = parseRepsToInt(set.reps)
          if (repCount <= 0 || repCount > 10) continue
          const existing = byReps.get(repCount)
          if (!existing || set.load > existing.load) {
            byReps.set(repCount, { load: set.load, loadUnit: loadUnit ?? 'LB', achievedAt: r.workout.scheduledAt.toISOString(), resultId: r.id, workoutId: r.workout.id })
          }
        }
      }
      return [...byReps.entries()].map(([repCount, d]) => ({ repCount, ...d })).sort((a, b) => a.repCount - b.repCount)
    }
    case 'MAX_REPS': {
      let best: { maxReps: number; achievedAt: string; resultId: string; workoutId: string } | null = null
      for (const r of results) {
        const { sets } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (!set.reps) continue
          const reps = parseRepsToInt(set.reps)
          if (reps <= 0) continue
          if (!best || reps > best.maxReps) {
            best = { maxReps: reps, achievedAt: r.workout.scheduledAt.toISOString(), resultId: r.id, workoutId: r.workout.id }
          }
        }
      }
      return best ? [best] : []
    }
    case 'TIME': {
      const byDist = new Map<string, { distance: number; distanceUnit: string; seconds: number; achievedAt: string; resultId: string; workoutId: string }>()
      for (const r of results) {
        const { sets, distanceUnit } = extractMovementSets(r.value, movementId)
        const unit = distanceUnit ?? 'M'
        for (const set of sets) {
          if (set.distance === undefined || !set.seconds) continue
          const key = `${set.distance}::${unit}`
          const existing = byDist.get(key)
          if (!existing || set.seconds < existing.seconds) {
            byDist.set(key, { distance: set.distance, distanceUnit: unit, seconds: set.seconds, achievedAt: r.workout.scheduledAt.toISOString(), resultId: r.id, workoutId: r.workout.id })
          }
        }
      }
      return [...byDist.values()].sort((a, b) => a.distance - b.distance)
    }
    case 'DISTANCE': {
      const bySeconds = new Map<number, { seconds: number; distance: number; distanceUnit: string; achievedAt: string; resultId: string; workoutId: string }>()
      for (const r of results) {
        const { sets, distanceUnit } = extractMovementSets(r.value, movementId)
        const unit = distanceUnit ?? 'M'
        for (const set of sets) {
          if (set.distance === undefined || !set.seconds) continue
          const existing = bySeconds.get(set.seconds)
          if (!existing || set.distance > existing.distance) {
            bySeconds.set(set.seconds, { seconds: set.seconds, distance: set.distance, distanceUnit: unit, achievedAt: r.workout.scheduledAt.toISOString(), resultId: r.id, workoutId: r.workout.id })
          }
        }
      }
      return [...bySeconds.values()].sort((a, b) => a.seconds - b.seconds)
    }
    case 'CALORIES': {
      const bySeconds = new Map<number, { seconds: number; calories: number; achievedAt: string; resultId: string; workoutId: string }>()
      for (const r of results) {
        const { sets } = extractMovementSets(r.value, movementId)
        for (const set of sets) {
          if (set.calories === undefined || !set.seconds) continue
          const existing = bySeconds.get(set.seconds)
          if (!existing || set.calories > existing.calories) {
            bySeconds.set(set.seconds, { seconds: set.seconds, calories: set.calories, achievedAt: r.workout.scheduledAt.toISOString(), resultId: r.id, workoutId: r.workout.id })
          }
        }
      }
      return [...bySeconds.values()].sort((a, b) => a.seconds - b.seconds)
    }
    case 'NONE':
      return []
  }
}

export interface MovementSummaryEntry {
  movementId: string
  name: string
  prTypes: MovementPrType[]
  primaryPR: PrimaryPR | null
  lastLoggedAt: string
}

export async function getLoggedMovementsForUser(userId: string): Promise<Record<MovementDisplayGroup, MovementSummaryEntry[]>> {
  const results = await prisma.result.findMany({
    where: { userId },
    select: {
      id: true,
      value: true,
      workout: {
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          workoutMovements: {
            select: { movement: { select: { id: true, name: true, category: true, prTypes: true } } },
          },
        },
      },
    },
    orderBy: { workout: { scheduledAt: 'desc' } },
  })

  type MovementAccum = {
    meta: { id: string; name: string; category: MovementCategory; prTypes: MovementPrType[] }
    results: ResultForPr[]
    lastLoggedAt: string
  }
  const byMovement = new Map<string, MovementAccum>()

  for (const result of results) {
    for (const wm of result.workout.workoutMovements) {
      const { sets } = extractMovementSets(result.value, wm.movement.id)
      if (!sets.length) continue
      const movId = wm.movement.id
      if (!byMovement.has(movId)) {
        byMovement.set(movId, {
          meta: wm.movement,
          results: [],
          lastLoggedAt: result.workout.scheduledAt.toISOString(),
        })
      }
      byMovement.get(movId)!.results.push({
        id: result.id,
        value: result.value,
        workout: { id: result.workout.id, title: result.workout.title, scheduledAt: result.workout.scheduledAt },
      })
    }
  }

  const groups: Record<MovementDisplayGroup, MovementSummaryEntry[]> = { strength: [], monostructural: [], gymnastics: [] }

  for (const { meta, results: movResults, lastLoggedAt } of byMovement.values()) {
    const group = toDisplayGroup(meta.category)
    if (!group) continue
    const primaryPR = meta.prTypes.length > 0 ? computePrimaryPr(meta.prTypes[0], meta.id, movResults) : null
    groups[group].push({ movementId: meta.id, name: meta.name, prTypes: meta.prTypes, primaryPR, lastLoggedAt })
  }

  for (const group of Object.values(groups)) {
    group.sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt))
  }

  return groups
}

export async function getMovementPrsByTypeForUser(userId: string, movementId: string) {
  const movement = await prisma.movement.findUnique({
    where: { id: movementId },
    select: { id: true, name: true, category: true, prTypes: true },
  })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })

  const allResults = await prisma.result.findMany({
    where: { userId, workout: { workoutMovements: { some: { movementId } } } },
    select: {
      id: true,
      value: true,
      workout: { select: { id: true, title: true, scheduledAt: true } },
    },
    orderBy: { workout: { scheduledAt: 'desc' } },
  })

  const byType: Record<string, { entries: ReturnType<typeof computePrEntries> }> = {}
  for (const prType of movement.prTypes) {
    byType[prType] = { entries: computePrEntries(prType, movementId, allResults) }
  }

  const seenWorkouts = new Set<string>()
  const recentAppearances: { workoutId: string; workoutName: string; scheduledAt: string; yourSets: unknown[] }[] = []
  for (const r of allResults) {
    if (seenWorkouts.has(r.workout.id)) continue
    const { sets } = extractMovementSets(r.value, movementId)
    if (!sets.length) continue
    seenWorkouts.add(r.workout.id)
    recentAppearances.push({
      workoutId: r.workout.id,
      workoutName: r.workout.title,
      scheduledAt: r.workout.scheduledAt.toISOString(),
      yourSets: sets,
    })
    if (recentAppearances.length >= 10) break
  }

  return { movement, byType, recentAppearances }
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export async function getMovementTrajectoryByTypeForUser(
  userId: string,
  movementId: string,
  prType: MovementPrType,
  range: TrajectoryRange,
): Promise<{ prType: MovementPrType; points: { achievedAt: string; value: number; label: string }[] }> {
  const movement = await prisma.movement.findUnique({
    where: { id: movementId },
    select: { prTypes: true },
  })
  if (!movement) throw Object.assign(new Error('Movement not found'), { statusCode: 404 })
  if (!movement.prTypes.includes(prType)) {
    throw Object.assign(new Error(`prType ${prType} is not tracked for this movement`), { statusCode: 400 })
  }

  const startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() - rangeToDays(range))
  startDate.setUTCHours(0, 0, 0, 0)

  const results = await prisma.result.findMany({
    where: { userId, createdAt: { gte: startDate }, workout: { workoutMovements: { some: { movementId } } } },
    select: {
      id: true,
      value: true,
      workout: { select: { id: true, title: true, scheduledAt: true } },
    },
  })

  const byDate = new Map<string, { value: number; label: string }>()

  for (const result of results) {
    const dateKey = toUtcDateKey(result.workout.scheduledAt)
    const { sets, loadUnit, distanceUnit } = extractMovementSets(result.value, movementId)

    switch (prType) {
      case 'LOAD': {
        for (const set of sets) {
          if (set.load === undefined || set.load <= 0) continue
          const existing = byDate.get(dateKey)
          if (!existing || set.load > existing.value) {
            byDate.set(dateKey, { value: set.load, label: `${set.load} ${loadUnit ?? 'LB'}` })
          }
        }
        break
      }
      case 'MAX_REPS': {
        for (const set of sets) {
          if (!set.reps) continue
          const reps = parseRepsToInt(set.reps)
          if (reps <= 0) continue
          const existing = byDate.get(dateKey)
          if (!existing || reps > existing.value) {
            byDate.set(dateKey, { value: reps, label: `${reps} reps` })
          }
        }
        break
      }
      case 'TIME': {
        for (const set of sets) {
          if (!set.seconds || set.distance === undefined) continue
          const existing = byDate.get(dateKey)
          if (!existing || set.seconds < existing.value) {
            const unit = distanceUnit ?? 'M'
            byDate.set(dateKey, { value: set.seconds, label: `${set.distance}${unit} in ${formatSeconds(set.seconds)}` })
          }
        }
        break
      }
      case 'DISTANCE': {
        for (const set of sets) {
          if (set.distance === undefined || !set.seconds) continue
          const existing = byDate.get(dateKey)
          if (!existing || set.distance > existing.value) {
            const unit = distanceUnit ?? 'M'
            byDate.set(dateKey, { value: set.distance, label: `${set.distance}${unit}` })
          }
        }
        break
      }
      case 'CALORIES': {
        for (const set of sets) {
          if (set.calories === undefined || !set.seconds) continue
          const existing = byDate.get(dateKey)
          if (!existing || set.calories > existing.value) {
            byDate.set(dateKey, { value: set.calories, label: `${set.calories} cal` })
          }
        }
        break
      }
    }
  }

  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([achievedAt, { value, label }]) => ({ achievedAt, value, label }))

  return { prType, points }
}
