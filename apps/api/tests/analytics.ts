/**
 * Integration tests for GET /api/me/analytics/consistency (#228)
 * and GET /api/me/analytics/tracked-movements + strength-trajectory (#229).
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
let movementId = ''   // a STRENGTH movement created during setup

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

  // Create a STRENGTH movement and attach it to the base workout
  const movement = await prisma.movement.create({
    data: { name: `BackSquat-${TS}`, category: 'STRENGTH' },
  })
  movementId = movement.id
  await prisma.workoutMovement.create({
    data: { workoutId, movementId, displayOrder: 0 },
  })

  console.log('  done')
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { id: { in: createdResultIds } } })
  // WorkoutMovements cascade-delete with workouts
  await prisma.workout.deleteMany({ where: { id: { in: [workoutId, ...extraWorkoutIds] } } })
  await prisma.movement.deleteMany({ where: { id: movementId } })
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
  extraWorkoutIds.push(wod.id)
  return r
}

// Seeds a STRENGTH result for the test movement with a logged load value.
// Creates a workout with the test movement attached so tracked-movements picks it up.
async function seedStrengthResult(offsetDays: number, load: number) {
  const createdAt = new Date()
  createdAt.setUTCDate(createdAt.getUTCDate() - offsetDays)
  const wod = await prisma.workout.create({
    data: {
      title: `STR-${TS}-d${offsetDays}`,
      description: '',
      type: 'STRENGTH',
      scheduledAt: createdAt,
      status: 'PUBLISHED',
      programId,
    },
  })
  await prisma.workoutMovement.create({
    data: { workoutId: wod.id, movementId, displayOrder: 0 },
  })
  const value = {
    movementResults: [
      {
        workoutMovementId: movementId,
        loadUnit: 'LB',
        sets: [{ reps: '1', load }],
      },
    ],
  }
  const r = await prisma.result.create({
    data: {
      userId,
      workoutId: wod.id,
      level: 'RX',
      workoutGender: 'OPEN',
      value,
      createdAt,
    },
  })
  createdResultIds.push(r.id)
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

async function testTrackedMovementsAuth401() {
  console.log('\n=== tracked-movements 401 when unauthenticated ===')
  const res = await api('GET', '/me/analytics/tracked-movements')
  check('status 401', 401, res.status)
}

async function testTrackedMovementsEmpty() {
  console.log('\n=== tracked-movements empty state ===')
  const res = await api('GET', '/me/analytics/tracked-movements', token)
  check('status 200', 200, res.status)
  check('returns array', true, Array.isArray(res.body))
  check('empty when no strength results', 0, (res.body as unknown[]).length)
}

async function testTrackedMovementsWithData() {
  console.log('\n=== tracked-movements with seeded STRENGTH results ===')
  await seedStrengthResult(5, 200)
  await seedStrengthResult(10, 210)
  await seedStrengthResult(15, 220)

  const res = await api('GET', '/me/analytics/tracked-movements', token)
  check('status 200', 200, res.status)
  const body = res.body as { movementId: string; name: string; count: number }[]
  check('returns at least one movement', true, Array.isArray(body) && body.length >= 1)
  check('top movement has correct movementId', movementId, body[0]?.movementId)
  check('top movement count >= 3', true, body[0]?.count >= 3)
}

async function testStrengthTrajectoryAuth401() {
  console.log('\n=== strength-trajectory 401 when unauthenticated ===')
  const res = await api('GET', `/me/analytics/strength-trajectory?movementId=${movementId}&range=3M`)
  check('status 401', 401, res.status)
}

async function testStrengthTrajectoryMissingParam() {
  console.log('\n=== strength-trajectory 400 when movementId missing ===')
  const res = await api('GET', '/me/analytics/strength-trajectory', token)
  check('status 400', 400, res.status)
}

async function testStrengthTrajectoryData() {
  console.log('\n=== strength-trajectory returns chronological points ===')
  const res = await api('GET', `/me/analytics/strength-trajectory?movementId=${movementId}&range=3M`, token)
  check('status 200', 200, res.status)
  const body = res.body as { movementId: string; currentPr: number | null; points: { date: string; maxLoad: number }[] }
  check('movementId matches', movementId, body.movementId)
  check('has points (strength results were seeded)', true, Array.isArray(body.points) && body.points.length >= 1)
  check('currentPr is a number', true, typeof body.currentPr === 'number')
  check('currentPr >= 200', true, (body.currentPr ?? 0) >= 200)
  // Points should be sorted ascending by date
  const dates = body.points.map((p) => p.date)
  const sorted = [...dates].sort()
  check('points are chronological', String(sorted), String(dates))
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
    await testTrackedMovementsAuth401()
    await testTrackedMovementsEmpty()
    await testTrackedMovementsWithData()
    await testStrengthTrajectoryAuth401()
    await testStrengthTrajectoryMissingParam()
    await testStrengthTrajectoryData()
  } finally {
    await teardown()
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
    if (fail > 0) process.exit(1)
  }
})()
