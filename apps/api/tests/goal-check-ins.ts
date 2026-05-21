/**
 * Integration tests for habit check-in endpoints (#455):
 *   POST   /api/goals/:goalId/check-ins
 *   DELETE /api/goals/:goalId/check-ins/:date
 *   GET    /api/goals/:goalId/check-ins
 *
 * Also exercises the updated HABIT branch of `computeGoalProgress` via
 * GET /api/goals/:goalId — verifies streak / week / 7-day shape.
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible via DATABASE_URL.
 * Run from apps/api/: npx tsx tests/goal-check-ins.ts
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
let pass = 0
let fail = 0

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let userId = ''
let otherUserId = ''
let token = ''
let otherToken = ''
let habitGoalId = ''
let prTargetGoalId = ''
let movementId = ''

function ymd(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

const DAY_MS = 24 * 60 * 60 * 1000

async function setup() {
  console.log('\n=== Setup ===')

  const user = await prisma.user.create({ data: { email: `goal-checkin-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'MEMBER').accessToken

  const other = await prisma.user.create({ data: { email: `goal-checkin-other-${TS}@test.com` } })
  otherUserId = other.id
  otherToken = signTokenPair(otherUserId, 'MEMBER').accessToken

  const habit = await prisma.goal.create({
    data: { userId, type: 'HABIT', title: `Avoid sugar ${TS}` },
  })
  habitGoalId = habit.id

  // A PR_TARGET goal for the "wrong type" rejection test. Needs a movement.
  const movement = await prisma.movement.create({
    data: { name: `Squat-${TS}`, category: 'STRENGTH', prTypes: ['LOAD'] },
  })
  movementId = movement.id

  const pr = await prisma.goal.create({
    data: {
      userId,
      type: 'PR_TARGET',
      title: 'Squat 315',
      movementId,
      targetPrType: 'LOAD',
      targetValue: 315,
      targetLoadUnit: 'LB',
      targetRepCount: 1,
    },
  })
  prTargetGoalId = pr.id

  console.log(`  user=${userId} habitGoal=${habitGoalId} prTargetGoal=${prTargetGoalId}`)
}

async function cleanup() {
  console.log('\n=== Cleanup ===')
  await prisma.goalCheckIn.deleteMany({ where: { userId } })
  await prisma.goalCheckIn.deleteMany({ where: { userId: otherUserId } })
  await prisma.goal.deleteMany({ where: { userId } })
  await prisma.goal.deleteMany({ where: { userId: otherUserId } })
  if (movementId) await prisma.movement.deleteMany({ where: { id: movementId } })
  if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } })
  if (userId) await prisma.user.deleteMany({ where: { id: userId } })
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

async function testAuthGuards() {
  console.log('\n=== Auth guards (401 / 403) ===')
  const r1 = await api('POST', `/goals/${habitGoalId}/check-ins`)
  check('POST — 401 without token', 401, r1.status)
  const r2 = await api('DELETE', `/goals/${habitGoalId}/check-ins/2026-05-21`)
  check('DELETE — 401 without token', 401, r2.status)
  const r3 = await api('GET', `/goals/${habitGoalId}/check-ins`)
  check('GET — 401 without token', 401, r3.status)

  const r4 = await api('POST', `/goals/${habitGoalId}/check-ins`, otherToken, {})
  check('POST — 403 on another user\'s goal', 403, r4.status)
  const r5 = await api('GET', `/goals/${habitGoalId}/check-ins`, otherToken)
  check('GET — 403 on another user\'s goal', 403, r5.status)

  const r6 = await api('POST', `/goals/nonexistent-id/check-ins`, token, {})
  check('POST — 404 for missing goal', 404, r6.status)
}

// ─── Wrong-type rejection ─────────────────────────────────────────────────────

async function testRejectsNonHabit() {
  console.log('\n=== Wrong type — PR_TARGET goal rejects check-ins ===')
  const r = await api('POST', `/goals/${prTargetGoalId}/check-ins`, token, {})
  check('POST — 400 on PR_TARGET goal', 400, r.status)
  const r2 = await api('GET', `/goals/${prTargetGoalId}/check-ins`, token)
  check('GET — 400 on PR_TARGET goal', 400, r2.status)
}

// ─── Record + idempotency + note edit ─────────────────────────────────────────

async function testRecordAndIdempotent() {
  console.log('\n=== POST /check-ins — record + idempotency ===')

  // 1st tap today — no note.
  const r1 = await api('POST', `/goals/${habitGoalId}/check-ins`, token, {})
  check('201 on first tap', 201, r1.status)
  const checkIn1 = r1.body.checkIn as Record<string, unknown>
  const goal1 = r1.body.goal as Record<string, unknown>
  check('checkIn.date = today', ymd(new Date()), checkIn1.date)
  check('checkIn.note = null', null, checkIn1.note)
  const progress1 = goal1.progress as Record<string, unknown>
  check('progress.type=HABIT', 'HABIT', progress1.type)
  check('progress.currentStreak=1', 1, progress1.currentStreak)
  check('progress.checkedInToday=true', true, progress1.checkedInToday)
  check('progress.totalCheckIns=1', 1, progress1.totalCheckIns)
  check('last7Days length=7', 7, (progress1.last7Days as unknown[]).length)
  check('last7Days[0].checkedIn=true', true, (progress1.last7Days as Array<{ checkedIn: boolean }>)[0].checkedIn)

  // 2nd tap same day — upsert; new note attaches.
  const r2 = await api('POST', `/goals/${habitGoalId}/check-ins`, token, { note: 'felt great' })
  check('201 on re-tap', 201, r2.status)
  const checkIn2 = r2.body.checkIn as Record<string, unknown>
  check('checkIn.note updated', 'felt great', checkIn2.note)
  check('same id (upsert, not duplicate)', checkIn1.id, checkIn2.id)
  const progress2 = (r2.body.goal as Record<string, unknown>).progress as Record<string, unknown>
  check('progress.totalCheckIns still 1', 1, progress2.totalCheckIns)
}

// ─── Streak math ──────────────────────────────────────────────────────────────

async function testStreakMath() {
  console.log('\n=== Streak math — 4 consecutive days ending today ===')

  // Seed rows for [today-3, today-2, today-1] — `today` was set in
  // testRecordAndIdempotent. Total streak should land at 4.
  const today = utcMidnight(new Date())
  for (let i = 1; i <= 3; i++) {
    await prisma.goalCheckIn.create({
      data: {
        goalId: habitGoalId,
        userId,
        date: new Date(today.getTime() - i * DAY_MS),
      },
    })
  }

  const r = await api('GET', `/goals/${habitGoalId}`, token)
  check('200', 200, r.status)
  const progress = r.body.progress as Record<string, unknown>
  check('currentStreak=4', 4, progress.currentStreak)
  check('longestStreak=4', 4, progress.longestStreak)
  check('totalCheckIns=4', 4, progress.totalCheckIns)
  check('checkedInToday=true', true, progress.checkedInToday)
  const last7 = progress.last7Days as Array<{ date: string; checkedIn: boolean }>
  check('last7Days[0]=today checked', true, last7[0].checkedIn)
  check('last7Days[1]=yesterday checked', true, last7[1].checkedIn)
  check('last7Days[3]=3 days ago checked', true, last7[3].checkedIn)
  check('last7Days[4]=4 days ago NOT checked', false, last7[4].checkedIn)
}

// ─── Streak break with a gap day ──────────────────────────────────────────────

async function testStreakBreak() {
  console.log('\n=== Streak math — gap breaks the streak ===')

  // Wipe and reseed: today=0, today-1=0, today-2=1, today-3=1 → streak=0,
  // longest=2. (Today and yesterday both missing means the lenient rule
  // doesn't apply, so currentStreak should be 0.)
  await prisma.goalCheckIn.deleteMany({ where: { goalId: habitGoalId } })
  const today = utcMidnight(new Date())
  await prisma.goalCheckIn.create({
    data: { goalId: habitGoalId, userId, date: new Date(today.getTime() - 2 * DAY_MS) },
  })
  await prisma.goalCheckIn.create({
    data: { goalId: habitGoalId, userId, date: new Date(today.getTime() - 3 * DAY_MS) },
  })

  const r = await api('GET', `/goals/${habitGoalId}`, token)
  const progress = r.body.progress as Record<string, unknown>
  check('currentStreak=0 (gap)', 0, progress.currentStreak)
  check('longestStreak=2', 2, progress.longestStreak)
  check('checkedInToday=false', false, progress.checkedInToday)
  check('totalCheckIns=2', 2, progress.totalCheckIns)
}

// ─── Lenient rule — yesterday-only counts as streak=1 ────────────────────────

async function testStreakLenient() {
  console.log('\n=== Streak math — yesterday-only is lenient (streak=1) ===')

  await prisma.goalCheckIn.deleteMany({ where: { goalId: habitGoalId } })
  const today = utcMidnight(new Date())
  await prisma.goalCheckIn.create({
    data: { goalId: habitGoalId, userId, date: new Date(today.getTime() - DAY_MS) },
  })

  const r = await api('GET', `/goals/${habitGoalId}`, token)
  const progress = r.body.progress as Record<string, unknown>
  check('currentStreak=1 (yesterday only, lenient)', 1, progress.currentStreak)
  check('checkedInToday=false', false, progress.checkedInToday)
}

// ─── DELETE check-in ──────────────────────────────────────────────────────────

async function testDeleteCheckIn() {
  console.log('\n=== DELETE /check-ins/:date ===')

  // Seed a single check-in for today, then delete it.
  await prisma.goalCheckIn.deleteMany({ where: { goalId: habitGoalId } })
  await prisma.goalCheckIn.create({
    data: { goalId: habitGoalId, userId, date: utcMidnight(new Date()) },
  })

  const todayStr = ymd(new Date())
  const r1 = await api('DELETE', `/goals/${habitGoalId}/check-ins/${todayStr}`, token)
  check('200', 200, r1.status)
  const progress = (r1.body.goal as Record<string, unknown>).progress as Record<string, unknown>
  check('totalCheckIns=0 after delete', 0, progress.totalCheckIns)
  check('checkedInToday=false after delete', false, progress.checkedInToday)

  // 2nd delete on the same date — 404 (no row).
  const r2 = await api('DELETE', `/goals/${habitGoalId}/check-ins/${todayStr}`, token)
  check('404 on second delete', 404, r2.status)

  // Bad date format → 400.
  const r3 = await api('DELETE', `/goals/${habitGoalId}/check-ins/2026-13-99`, token)
  check('400 on bad date format', 400, r3.status)
}

// ─── GET check-ins list ───────────────────────────────────────────────────────

async function testListCheckIns() {
  console.log('\n=== GET /check-ins ===')

  await prisma.goalCheckIn.deleteMany({ where: { goalId: habitGoalId } })
  const today = utcMidnight(new Date())
  for (let i = 0; i < 5; i++) {
    await prisma.goalCheckIn.create({
      data: {
        goalId: habitGoalId,
        userId,
        date: new Date(today.getTime() - i * DAY_MS),
        note: `day -${i}`,
      },
    })
  }

  const r = await api('GET', `/goals/${habitGoalId}/check-ins`, token)
  check('200', 200, r.status)
  const rows = r.body as unknown as Array<{ date: string; note: string }>
  check('5 rows', 5, rows.length)
  check('newest first — first row is today', ymd(today), rows[0].date)
  check('note preserved', 'day -0', rows[0].note)

  // since/until window.
  const since = ymd(new Date(today.getTime() - 2 * DAY_MS))
  const rWindow = await api('GET', `/goals/${habitGoalId}/check-ins?since=${since}`, token)
  const windowRows = rWindow.body as unknown as unknown[]
  check('since filter — 3 rows (today, t-1, t-2)', 3, windowRows.length)

  // limit.
  const rLimit = await api('GET', `/goals/${habitGoalId}/check-ins?limit=2`, token)
  const limitRows = rLimit.body as unknown as unknown[]
  check('limit=2 — 2 rows', 2, limitRows.length)
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function testNoteTooLong() {
  console.log('\n=== POST — note > 280 chars rejected ===')
  const long = 'a'.repeat(281)
  const r = await api('POST', `/goals/${habitGoalId}/check-ins`, token, { note: long })
  check('400', 400, r.status)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await setup()
  try {
    await testAuthGuards()
    await testRejectsNonHabit()
    await testRecordAndIdempotent()
    await testStreakMath()
    await testStreakBreak()
    await testStreakLenient()
    await testDeleteCheckIn()
    await testListCheckIns()
    await testNoteTooLong()
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
