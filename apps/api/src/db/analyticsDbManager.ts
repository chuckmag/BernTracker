import { prisma } from '@wodalytics/db'

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
