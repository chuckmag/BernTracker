/**
 * Integration tests for GET /api/me/analytics/consistency (#228).
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible via DATABASE_URL.
 * Run from apps/api/: npx tsx tests/analytics.ts
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

const TS = Date.now()
let userId = ''
let token = ''
const createdResultIds: string[] = []
const extraWorkoutIds: string[] = []
let workoutId = ''
let programId = ''

async function setup() {
  console.log('\n=== Setup ===')
  const user = await prisma.user.create({ data: { email: `analytics-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'MEMBER').accessToken

  const program = await prisma.program.create({
    data: { name: `Prog-${TS}`, startDate: new Date(), ownerUserId: userId },
  })
  programId = program.id

  const workout = await prisma.workout.create({
    data: {
      title: `WOD-${TS}`,
      description: '',
      type: 'FOR_TIME',
      scheduledAt: new Date(),
      status: 'PUBLISHED',
      programId,
    },
  })
  workoutId = workout.id

  console.log('  done')
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { id: { in: createdResultIds } } })
  await prisma.workout.deleteMany({ where: { id: { in: [workoutId, ...extraWorkoutIds] } } })
  await prisma.program.deleteMany({ where: { id: programId } })
  await prisma.user.deleteMany({ where: { id: userId } })
  console.log('  done')
}

async function seedResult(offsetDays: number) {
  const createdAt = new Date()
  createdAt.setUTCDate(createdAt.getUTCDate() - offsetDays)
  // Each result needs its own workout (unique constraint on userId+workoutId)
  const wod = await prisma.workout.create({
    data: {
      title: `WOD-${TS}-d${offsetDays}`,
      description: '',
      type: 'FOR_TIME',
      scheduledAt: createdAt,
      status: 'PUBLISHED',
      programId,
    },
  })
  const r = await prisma.result.create({
    data: {
      userId,
      workoutId: wod.id,
      level: 'RX',
      workoutGender: 'OPEN',
      value: {},
      createdAt,
    },
  })
  createdResultIds.push(r.id)
  // Track the extra workout for cleanup
  extraWorkoutIds.push(wod.id)
  return r
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testAuth401() {
  console.log('\n=== 401 when unauthenticated ===')
  const res = await api('GET', '/me/analytics/consistency')
  check('status 401', 401, res.status)
}

async function testEmptyState() {
  console.log('\n=== Empty state (no results) ===')
  const res = await api('GET', '/me/analytics/consistency', token)
  check('status 200', 200, res.status)
  check('currentStreak 0', 0, (res.body as { currentStreak: number }).currentStreak)
  check('longestStreak 0', 0, (res.body as { longestStreak: number }).longestStreak)
  check('history is array', true, Array.isArray((res.body as { history: unknown }).history))
  check('history length 0', 0, ((res.body as { history: unknown[] }).history).length)
}

async function testStreakComputation() {
  console.log('\n=== Streak computation (3-day streak) ===')
  await seedResult(0)
  await seedResult(1)
  await seedResult(2)

  const res = await api('GET', '/me/analytics/consistency', token)
  check('status 200', 200, res.status)
  const body = res.body as { currentStreak: number; longestStreak: number; history: { date: string; count: number }[] }
  check('currentStreak 3', 3, body.currentStreak)
  check('longestStreak >= 3', true, body.longestStreak >= 3)
  check('history has 3 entries', 3, body.history.length)
  check('history entries have count > 0', true, body.history.every((h) => h.count > 0))
}

async function testWeeksParam() {
  console.log('\n=== weeks param clamps to 52 ===')
  const res = await api('GET', '/me/analytics/consistency?weeks=100', token)
  check('status 200', 200, res.status)
}

async function testDefaultWeeks() {
  console.log('\n=== default weeks=16 ===')
  const res = await api('GET', '/me/analytics/consistency', token)
  check('status 200', 200, res.status)
}

// ─── Run ──────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    await setup()
    await testAuth401()
    await testEmptyState()
    await testStreakComputation()
    await testWeeksParam()
    await testDefaultWeeks()
  } finally {
    await teardown()
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
    if (fail > 0) process.exit(1)
  }
})()
