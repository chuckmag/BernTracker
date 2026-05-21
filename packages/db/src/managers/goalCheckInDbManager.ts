import { prisma } from '../client.js'
import type { GoalCheckIn } from '../client.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecordCheckInData {
  goalId: string
  userId: string
  // Calendar date the habit was honored. Caller is expected to pass a Date
  // already floored to UTC midnight (the @db.Date column ignores the time
  // component, but consistent input keeps tests deterministic).
  date: Date
  note?: string | null
}

export interface GoalCheckInStats {
  currentStreak: number
  longestStreak: number
  totalCheckIns: number
  weekCheckIns: number
  last7Days: Array<{ date: string; checkedIn: boolean }>
  checkedInToday: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

// Floor a Date to UTC midnight — the value @db.Date will round-trip to.
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function ymd(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

// Start of the ISO week containing `d` (Monday-anchored, UTC).
function isoWeekStart(d: Date): Date {
  const mid = utcMidnight(d)
  // getUTCDay: Sunday=0 … Saturday=6. ISO week starts Monday, so shift by
  // ((day + 6) % 7) days.
  const offset = (mid.getUTCDay() + 6) % 7
  return new Date(mid.getTime() - offset * DAY_MS)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

// Idempotent: re-tapping the same day updates the note instead of failing
// with P2002 on the (goalId, date) unique. Re-tap with no note leaves the
// existing note intact.
export async function recordCheckIn(data: RecordCheckInData): Promise<GoalCheckIn> {
  const date = utcMidnight(data.date)
  return prisma.goalCheckIn.upsert({
    where: { goalId_date: { goalId: data.goalId, date } },
    create: {
      goalId: data.goalId,
      userId: data.userId,
      date,
      note: data.note ?? null,
    },
    update: data.note === undefined ? {} : { note: data.note ?? null },
  })
}

// Returns the deleted row, or null if no row existed for that date.
export async function deleteCheckIn(goalId: string, date: Date): Promise<GoalCheckIn | null> {
  const flooredDate = utcMidnight(date)
  const existing = await prisma.goalCheckIn.findUnique({
    where: { goalId_date: { goalId, date: flooredDate } },
  })
  if (!existing) return null
  await prisma.goalCheckIn.delete({ where: { id: existing.id } })
  return existing
}

interface FindCheckInsOptions {
  since?: Date
  until?: Date
  limit?: number
}

// Newest first. `since`/`until` are inclusive when present.
export async function findCheckInsForGoal(
  goalId: string,
  opts: FindCheckInsOptions = {},
): Promise<GoalCheckIn[]> {
  const where: { goalId: string; date?: { gte?: Date; lte?: Date } } = { goalId }
  if (opts.since || opts.until) {
    where.date = {}
    if (opts.since) where.date.gte = utcMidnight(opts.since)
    if (opts.until) where.date.lte = utcMidnight(opts.until)
  }
  return prisma.goalCheckIn.findMany({
    where,
    orderBy: { date: 'desc' },
    take: opts.limit,
  })
}

// ─── Stats ────────────────────────────────────────────────────────────────────

// Derives streak + 7-day window + week count for a habit goal from its
// check-in rows. `now` is injected so tests are timezone-deterministic.
//
// Streak rule: walk backward from today. If today has a check-in, current
// streak starts at 1 and increments while consecutive prior days exist.
// If today has no check-in but yesterday does, we still walk from
// yesterday — this is intentionally lenient ("you haven't tapped yet
// today, but your streak isn't broken until tomorrow"). The streak is
// fully broken (== 0) only once *two* consecutive missing days separate
// today from the most recent check-in.
export async function computeGoalCheckInStats(
  goalId: string,
  now: Date,
): Promise<GoalCheckInStats> {
  const today = utcMidnight(now)
  const todayMs = today.getTime()

  // Pull the full set of (date) rows for this goal — one row per day means
  // even an aggressive long-time user is unlikely to exceed a few thousand
  // rows. If that ever becomes an issue we can window this query.
  const rows = await prisma.goalCheckIn.findMany({
    where: { goalId },
    select: { date: true },
    orderBy: { date: 'desc' },
  })

  const totalCheckIns = rows.length
  const dateSet = new Set(rows.map((r) => utcMidnight(r.date).getTime()))

  // ── current streak ──
  //
  // Start probing from today; if today is missing but yesterday is present,
  // start from yesterday (lenient — today still has hours to be tapped).
  let probe = todayMs
  let currentStreak = 0
  const checkedInToday = dateSet.has(todayMs)
  if (!checkedInToday && dateSet.has(todayMs - DAY_MS)) {
    probe = todayMs - DAY_MS
  }
  while (dateSet.has(probe)) {
    currentStreak++
    probe -= DAY_MS
  }

  // ── longest streak (lifetime) ──
  //
  // Walk dates ascending; reset the run length each time consecutiveness
  // breaks. Cheaper than O(n²) probing per date.
  const ascending = Array.from(dateSet).sort((a, b) => a - b)
  let longestStreak = 0
  let run = 0
  let prev: number | null = null
  for (const ts of ascending) {
    if (prev !== null && ts - prev === DAY_MS) run++
    else run = 1
    if (run > longestStreak) longestStreak = run
    prev = ts
  }

  // ── last 7 days (newest first, includes today) ──
  const last7Days: Array<{ date: string; checkedIn: boolean }> = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(todayMs - i * DAY_MS)
    last7Days.push({ date: ymd(d), checkedIn: dateSet.has(d.getTime()) })
  }

  // ── current ISO-week count (Mon–Sun, UTC) ──
  const weekStart = isoWeekStart(today)
  const weekEndMs = weekStart.getTime() + 7 * DAY_MS
  let weekCheckIns = 0
  for (const ts of dateSet) {
    if (ts >= weekStart.getTime() && ts < weekEndMs) weekCheckIns++
  }

  return {
    currentStreak,
    longestStreak,
    totalCheckIns,
    weekCheckIns,
    last7Days,
    checkedInToday,
  }
}
