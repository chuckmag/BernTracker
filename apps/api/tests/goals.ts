/**
 * Integration tests for goal endpoints (#432):
 *   GET    /api/users/me/goals
 *   POST   /api/users/me/goals
 *   GET    /api/goals/:goalId
 *   PATCH  /api/goals/:goalId
 *   DELETE /api/goals/:goalId
 *
 * Also exercises auto-completion of LOAD movement-PR goals, benchmark goals,
 * and frequency goals via the existing result + benchmark write paths.
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible via DATABASE_URL.
 * Run from apps/api/: npx tsx tests/goals.ts
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
let movementId = ''
let namedWorkoutId = ''
let namedWorkoutName = ''
let strengthWorkoutId = ''
let benchmarkWorkoutId = ''
let programId = ''
const createdGoalIds: string[] = []
const createdResultIds: string[] = []
const createdBenchmarkResultIds: string[] = []
const createdMovementPRIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')

  const user = await prisma.user.create({ data: { email: `goals-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'MEMBER').accessToken

  const other = await prisma.user.create({ data: { email: `goals-other-${TS}@test.com` } })
  otherUserId = other.id
  otherToken = signTokenPair(otherUserId, 'MEMBER').accessToken

  // Movement for PR Target movement goals.
  const movement = await prisma.movement.create({
    data: { name: `BackSquat-${TS}`, category: 'STRENGTH', prTypes: ['LOAD'] },
  })
  movementId = movement.id

  // NamedWorkout for PR Target benchmark goals.
  const nw = await prisma.namedWorkout.create({
    data: { name: `Fran-${TS}`, category: 'GIRL_WOD' },
  })
  namedWorkoutId = nw.id
  namedWorkoutName = nw.name

  // Strength workout used for the auto-completion test that logs a Result.
  const program = await prisma.program.create({
    data: { name: `GoalsProg-${TS}`, startDate: new Date(), ownerUserId: userId },
  })
  programId = program.id
  const sw = await prisma.workout.create({
    data: {
      title: `Back Squat ${TS}`,
      description: 'Back squat',
      type: 'STRENGTH',
      scheduledAt: new Date(),
      status: 'PUBLISHED',
      programId,
      workoutMovements: { create: [{ movementId, displayOrder: 0 }] },
    },
  })
  strengthWorkoutId = sw.id

  // Benchmark instance workout linked to the NamedWorkout.
  const bw = await prisma.workout.create({
    data: {
      title: `Fran ${TS}`,
      description: 'Fran',
      type: 'FOR_TIME',
      scheduledAt: new Date(),
      status: 'PUBLISHED',
      programId,
      namedWorkoutId,
    },
  })
  benchmarkWorkoutId = bw.id

  console.log(`  user=${userId} movement=${movementId} namedWorkout=${namedWorkoutId}`)
}

async function cleanup() {
  console.log('\n=== Cleanup ===')
  for (const id of createdResultIds) await prisma.result.deleteMany({ where: { id } })
  for (const id of createdMovementPRIds) await prisma.movementPR.deleteMany({ where: { id } })
  for (const id of createdBenchmarkResultIds) await prisma.benchmarkResult.deleteMany({ where: { id } })
  await prisma.movementPR.deleteMany({ where: { userId } })
  await prisma.movementPR.deleteMany({ where: { userId: otherUserId } })
  await prisma.result.deleteMany({ where: { userId } })
  await prisma.result.deleteMany({ where: { userId: otherUserId } })
  await prisma.benchmarkResult.deleteMany({ where: { userId } })
  await prisma.benchmarkResult.deleteMany({ where: { userId: otherUserId } })
  // Goal rows cascade-delete with the user; explicit deletes are belt-and-braces
  // in case an assertion failure left us mid-test.
  await prisma.goal.deleteMany({ where: { userId } })
  await prisma.goal.deleteMany({ where: { userId: otherUserId } })
  if (strengthWorkoutId) await prisma.workout.deleteMany({ where: { id: strengthWorkoutId } })
  if (benchmarkWorkoutId) await prisma.workout.deleteMany({ where: { id: benchmarkWorkoutId } })
  if (programId) await prisma.program.deleteMany({ where: { id: programId } })
  if (movementId) await prisma.movement.deleteMany({ where: { id: movementId } })
  if (namedWorkoutId) await prisma.namedWorkout.deleteMany({ where: { id: namedWorkoutId } })
  if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } })
  if (userId) await prisma.user.deleteMany({ where: { id: userId } })
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

async function testAuthGuards() {
  console.log('\n=== Auth guards (401) ===')
  const r1 = await api('GET', '/users/me/goals')
  check('GET /users/me/goals — 401 without token', 401, r1.status)
  const r2 = await api('POST', '/users/me/goals', undefined, { type: 'HABIT', title: 'x' })
  check('POST /users/me/goals — 401 without token', 401, r2.status)
  const r3 = await api('GET', '/goals/fake')
  check('GET /goals/:id — 401 without token', 401, r3.status)
  const r4 = await api('PATCH', '/goals/fake', undefined, { title: 'x' })
  check('PATCH /goals/:id — 401 without token', 401, r4.status)
  const r5 = await api('DELETE', '/goals/fake')
  check('DELETE /goals/:id — 401 without token', 401, r5.status)
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function testCreatePrTargetMovementGoal() {
  console.log('\n=== POST /users/me/goals — PR Target movement (LOAD) ===')
  const r = await api('POST', '/users/me/goals', token, {
    type: 'PR_TARGET',
    title: 'Back Squat 1RM 315 lb',
    movementId,
    targetPrType: 'LOAD',
    targetValue: 315,
    targetLoadUnit: 'LB',
    targetRepCount: 1,
  })
  check('201 status', 201, r.status)
  check('has id', true, typeof r.body.id === 'string')
  check('type=PR_TARGET', 'PR_TARGET', r.body.type)
  check('status=ACTIVE', 'ACTIVE', r.body.status)
  check('movementId set', movementId, r.body.movementId)
  check('targetValue echoed', 315, r.body.targetValue)
  check('targetLoadUnit echoed', 'LB', r.body.targetLoadUnit)
  check('targetRepCount echoed', 1, r.body.targetRepCount)
  const progress = r.body.progress as Record<string, unknown>
  check('progress.type=PR_TARGET', 'PR_TARGET', progress.type)
  check('progress.current null (no PR yet)', null, progress.current)
  check('progress.target=315', 315, progress.target)
  check('progress.isComplete=false', false, progress.isComplete)
  createdGoalIds.push(r.body.id as string)
}

async function testCreatePrTargetBenchmarkGoal() {
  console.log('\n=== POST /users/me/goals — PR Target benchmark (TIME) ===')
  const r = await api('POST', '/users/me/goals', token, {
    type: 'PR_TARGET',
    title: 'Fran sub-4:00',
    namedWorkoutId,
    targetPrType: 'TIME',
    targetValue: 240,
    targetDate: '2026-12-31T00:00:00.000Z',
  })
  check('201 status', 201, r.status)
  check('namedWorkoutId set', namedWorkoutId, r.body.namedWorkoutId)
  check('targetPrType=TIME', 'TIME', r.body.targetPrType)
  check('targetValue=240', 240, r.body.targetValue)
  check('targetDate set', true, typeof r.body.targetDate === 'string')
  const progress = r.body.progress as Record<string, unknown>
  check('progress.target=240', 240, progress.target)
  check('progress.isComplete=false', false, progress.isComplete)
  createdGoalIds.push(r.body.id as string)
}

async function testCreateFrequencyGoal() {
  console.log('\n=== POST /users/me/goals — FREQUENCY ===')
  const r = await api('POST', '/users/me/goals', token, {
    type: 'FREQUENCY',
    title: '3 workouts/week × 4 weeks',
    frequencyPerWeek: 3,
    frequencyWeeks: 4,
  })
  check('201 status', 201, r.status)
  check('type=FREQUENCY', 'FREQUENCY', r.body.type)
  check('frequencyPerWeek=3', 3, r.body.frequencyPerWeek)
  check('frequencyWeeks=4', 4, r.body.frequencyWeeks)
  const progress = r.body.progress as Record<string, unknown>
  check('progress.type=FREQUENCY', 'FREQUENCY', progress.type)
  check('workoutsRequired=12', 12, progress.workoutsRequired)
  check('workoutsLogged=0', 0, progress.workoutsLogged)
  check('isComplete=false', false, progress.isComplete)
  createdGoalIds.push(r.body.id as string)
}

async function testCreateHabitGoal() {
  console.log('\n=== POST /users/me/goals — HABIT ===')
  const r = await api('POST', '/users/me/goals', token, {
    type: 'HABIT',
    title: 'Avoid added sugars',
  })
  check('201 status', 201, r.status)
  check('type=HABIT', 'HABIT', r.body.type)
  check('movementId null', null, r.body.movementId)
  check('targetValue null', null, r.body.targetValue)
  check('frequencyPerWeek null', null, r.body.frequencyPerWeek)
  const progress = r.body.progress as Record<string, unknown>
  check('progress.type=HABIT', 'HABIT', progress.type)
  createdGoalIds.push(r.body.id as string)
}

async function testCreateValidation() {
  console.log('\n=== POST /users/me/goals — validation ===')

  // 400: PR_TARGET without movementId / namedWorkoutId
  const r1 = await api('POST', '/users/me/goals', token, {
    type: 'PR_TARGET',
    title: 'No target',
    targetPrType: 'LOAD',
    targetValue: 100,
    targetLoadUnit: 'LB',
    targetRepCount: 1,
  })
  check('400 PR_TARGET requires movementId XOR namedWorkoutId', 400, r1.status)

  // 400: PR_TARGET with BOTH movementId and namedWorkoutId
  const r2 = await api('POST', '/users/me/goals', token, {
    type: 'PR_TARGET',
    title: 'Conflict',
    movementId,
    namedWorkoutId,
    targetPrType: 'LOAD',
    targetValue: 100,
    targetLoadUnit: 'LB',
    targetRepCount: 1,
  })
  check('400 rejects both movement+benchmark on PR_TARGET', 400, r2.status)

  // 400: LOAD without targetLoadUnit / targetRepCount
  const r3 = await api('POST', '/users/me/goals', token, {
    type: 'PR_TARGET',
    title: 'LOAD missing unit',
    movementId,
    targetPrType: 'LOAD',
    targetValue: 200,
  })
  check('400 LOAD requires targetLoadUnit + targetRepCount', 400, r3.status)

  // 400: FREQUENCY missing required fields
  const r4 = await api('POST', '/users/me/goals', token, { type: 'FREQUENCY', title: 'no nums' })
  check('400 FREQUENCY requires perWeek + weeks', 400, r4.status)

  // 400: HABIT missing title
  const r5 = await api('POST', '/users/me/goals', token, { type: 'HABIT' })
  check('400 HABIT requires title', 400, r5.status)

  // 400: unknown type
  const r6 = await api('POST', '/users/me/goals', token, { type: 'FOOBAR', title: 'x' })
  check('400 rejects unknown type', 400, r6.status)
}

// ─── Read ─────────────────────────────────────────────────────────────────────

async function testListGoals() {
  console.log('\n=== GET /users/me/goals ===')
  const r = await api('GET', '/users/me/goals', token)
  check('200 status', 200, r.status)
  const list = r.body as unknown as Array<Record<string, unknown>>
  check('returns array', true, Array.isArray(list))
  check('returns 4 active goals created above', 4, list.length)
  for (const g of list) {
    check(`goal ${(g.title as string).slice(0, 20)} belongs to user`, userId, g.userId)
  }
}

async function testListGoalsFilteredByStatus() {
  console.log('\n=== GET /users/me/goals?status= ===')
  const rActive = await api('GET', '/users/me/goals?status=ACTIVE', token)
  check('ACTIVE filter 200', 200, rActive.status)
  check('ACTIVE filter returns 4', 4, (rActive.body as unknown as unknown[]).length)

  const rCompleted = await api('GET', '/users/me/goals?status=COMPLETED', token)
  check('COMPLETED filter returns 0', 0, (rCompleted.body as unknown as unknown[]).length)

  const rInvalid = await api('GET', '/users/me/goals?status=NOPE', token)
  check('400 invalid status filter', 400, rInvalid.status)
}

async function testGetGoal() {
  console.log('\n=== GET /goals/:goalId ===')
  const goalId = createdGoalIds[0]!
  const r = await api('GET', `/goals/${goalId}`, token)
  check('200 status', 200, r.status)
  check('id matches', goalId, r.body.id)

  // 403: other user's goal
  const rOther = await api('GET', `/goals/${goalId}`, otherToken)
  check('403 reading another user\'s goal', 403, rOther.status)

  // 404: nonexistent
  const r404 = await api('GET', '/goals/does-not-exist', token)
  check('404 nonexistent goal', 404, r404.status)
}

// ─── Update / Delete ──────────────────────────────────────────────────────────

async function testUpdateGoal() {
  console.log('\n=== PATCH /goals/:goalId ===')
  const goalId = createdGoalIds[3]! // HABIT goal — safe to flip status without affecting other tests
  const r = await api('PATCH', `/goals/${goalId}`, token, {
    title: 'No added sugars (renamed)',
    status: 'COMPLETED',
  })
  check('200 status', 200, r.status)
  check('title updated', 'No added sugars (renamed)', r.body.title)
  check('status=COMPLETED', 'COMPLETED', r.body.status)
  check('completedAt set', true, typeof r.body.completedAt === 'string')

  // Flip back to ACTIVE clears completedAt
  const rRevert = await api('PATCH', `/goals/${goalId}`, token, { status: 'ACTIVE' })
  check('flipped back to ACTIVE', 'ACTIVE', rRevert.body.status)
  check('completedAt cleared', null, rRevert.body.completedAt)

  // 403: other user
  const r403 = await api('PATCH', `/goals/${goalId}`, otherToken, { title: 'hijack' })
  check('403 patching another user\'s goal', 403, r403.status)
}

async function testDeleteGoal() {
  console.log('\n=== DELETE /goals/:goalId ===')
  // Create a throw-away goal so the rest of the suite keeps its fixtures.
  const created = await api('POST', '/users/me/goals', token, { type: 'HABIT', title: 'delete me' })
  const id = created.body.id as string

  const r403 = await api('DELETE', `/goals/${id}`, otherToken)
  check('403 deleting another user\'s goal', 403, r403.status)

  const r = await api('DELETE', `/goals/${id}`, token)
  check('204 status', 204, r.status)

  const r404 = await api('GET', `/goals/${id}`, token)
  check('404 after delete', 404, r404.status)
}

// ─── Auto-completion ──────────────────────────────────────────────────────────

async function testMovementPrGoalAutoCompletion() {
  console.log('\n=== Auto-completion: LOAD movement PR goal ===')

  const goalId = createdGoalIds[0]! // Back Squat 1RM 315
  // Log a strength result with a 1-rep set at 315 lb on the back squat.
  const wm = await prisma.workoutMovement.findFirst({ where: { workoutId: strengthWorkoutId } })
  const r = await api('POST', `/workouts/${strengthWorkoutId}/results`, token, {
    level: 'RX',
    workoutGender: 'MALE',
    value: {
      movementResults: [
        {
          workoutMovementId: wm!.movementId,
          loadUnit: 'LB',
          sets: [{ reps: '1', load: 315 }],
        },
      ],
    },
  })
  check('result logged 201', 201, r.status)
  if (r.status === 201) {
    createdResultIds.push((r.body as { result: { id: string } }).result.id)
  }

  // Re-fetch the goal: should be COMPLETED.
  const rGoal = await api('GET', `/goals/${goalId}`, token)
  check('goal flipped to COMPLETED', 'COMPLETED', rGoal.body.status)
  check('completedAt set', true, typeof rGoal.body.completedAt === 'string')
  const progress = rGoal.body.progress as Record<string, unknown>
  check('progress.current=315', 315, progress.current)
  check('progress.isComplete=true', true, progress.isComplete)
}

async function testBenchmarkGoalAutoCompletion() {
  console.log('\n=== Auto-completion: benchmark TIME goal ===')

  const goalId = createdGoalIds[1]! // Fran sub-4:00 (240s target)
  // POST a benchmark result with TIME score = 200s (better than 240s).
  const r = await api('POST', `/me/benchmarks/${namedWorkoutId}/results`, token, {
    achievedAt: '2026-06-01T09:00:00.000Z',
    level: 'RX',
    workoutGender: 'MALE',
    value: { score: { kind: 'TIME', seconds: 200, cappedOut: false }, movementResults: [] },
  })
  check('benchmark result 201', 201, r.status)
  if (r.status === 201) createdBenchmarkResultIds.push((r.body as { id: string }).id)

  const rGoal = await api('GET', `/goals/${goalId}`, token)
  check('goal flipped to COMPLETED', 'COMPLETED', rGoal.body.status)
  const progress = rGoal.body.progress as Record<string, unknown>
  check('progress.current=200', 200, progress.current)
  check('progress.isComplete=true', true, progress.isComplete)
}

async function testFrequencyGoalProgress() {
  console.log('\n=== Frequency goal progress increments after Result logging ===')

  // The earlier strength-result log already incremented this user's Result
  // count. Verify the frequency goal's progress reflects it.
  const goalId = createdGoalIds[2]! // 3/wk × 4 weeks
  const r = await api('GET', `/goals/${goalId}`, token)
  const progress = r.body.progress as Record<string, unknown>
  check('progress.type=FREQUENCY', 'FREQUENCY', progress.type)
  check('workoutsLogged >= 1', true, (progress.workoutsLogged as number) >= 1)
  check('workoutsRequired=12', 12, progress.workoutsRequired)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await setup()
  try {
    await testAuthGuards()
    await testCreatePrTargetMovementGoal()
    await testCreatePrTargetBenchmarkGoal()
    await testCreateFrequencyGoal()
    await testCreateHabitGoal()
    await testCreateValidation()
    await testListGoals()
    await testListGoalsFilteredByStatus()
    await testGetGoal()
    await testUpdateGoal()
    await testDeleteGoal()
    await testMovementPrGoalAutoCompletion()
    await testBenchmarkGoalAutoCompletion()
    await testFrequencyGoalProgress()
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
