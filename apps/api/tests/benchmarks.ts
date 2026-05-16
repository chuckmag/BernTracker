/**
 * Integration tests for benchmark result endpoints (#367):
 *   GET  /api/me/benchmarks
 *   GET  /api/me/benchmarks/:namedWorkoutId
 *   POST /api/me/benchmarks/:namedWorkoutId/results
 *   PATCH /api/me/benchmarks/:namedWorkoutId/results/:id
 *   DELETE /api/me/benchmarks/:namedWorkoutId/results/:id
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible via DATABASE_URL.
 * Run from apps/api/: npx tsx tests/benchmarks.ts
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
let otherUserId = ''
let token = ''
let otherToken = ''
let namedWorkoutId = ''
let namedWorkoutName = ''
let programmedWorkoutId = ''
const createdResultIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')

  const user = await prisma.user.create({ data: { email: `benchmarks-${TS}@test.com` } })
  userId = user.id
  token = signTokenPair(userId, 'MEMBER').accessToken

  const other = await prisma.user.create({ data: { email: `benchmarks-other-${TS}@test.com` } })
  otherUserId = other.id
  otherToken = signTokenPair(otherUserId, 'MEMBER').accessToken

  const nw = await prisma.namedWorkout.create({
    data: { name: `Fran-${TS}`, category: 'GIRL_WOD' },
  })
  namedWorkoutId = nw.id
  namedWorkoutName = nw.name

  // Create a programmed workout tied to the NamedWorkout so the detail endpoint
  // can merge it into the history
  const program = await prisma.program.create({
    data: { name: `Prog-${TS}`, startDate: new Date(), ownerUserId: userId },
  })
  const workout = await prisma.workout.create({
    data: {
      title: `Fran WOD ${TS}`,
      description: 'Fran',
      type: 'FOR_TIME',
      scheduledAt: new Date('2024-01-15T10:00:00Z'),
      status: 'PUBLISHED',
      programId: program.id,
      namedWorkoutId,
    },
  })
  programmedWorkoutId = workout.id

  // Log a programmed result for this user
  await prisma.result.create({
    data: {
      userId,
      workoutId: programmedWorkoutId,
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'TIME', seconds: 180, cappedOut: false }, movementResults: [] },
      primaryScoreKind: 'TIME',
      primaryScoreValue: 180,
    },
  })

  console.log(`  user=${userId} namedWorkout=${namedWorkoutId}`)
}

async function testAuthGuards() {
  console.log('\n=== Auth guards (401) ===')

  const r1 = await api('GET', '/me/benchmarks')
  check('GET /me/benchmarks — 401 without token', 401, r1.status)

  const r2 = await api('GET', `/me/benchmarks/${namedWorkoutId}`)
  check('GET /me/benchmarks/:id — 401 without token', 401, r2.status)

  const r3 = await api('POST', `/me/benchmarks/${namedWorkoutId}/results`)
  check('POST /me/benchmarks/:id/results — 401 without token', 401, r3.status)

  const r4 = await api('PATCH', `/me/benchmarks/${namedWorkoutId}/results/fake-id`)
  check('PATCH /me/benchmarks/:id/results/:id — 401 without token', 401, r4.status)

  const r5 = await api('DELETE', `/me/benchmarks/${namedWorkoutId}/results/fake-id`)
  check('DELETE /me/benchmarks/:id/results/:id — 401 without token', 401, r5.status)
}

async function testListBenchmarks() {
  console.log('\n=== GET /me/benchmarks ===')

  const r = await api('GET', '/me/benchmarks', token)
  check('200 status', 200, r.status)

  const list = r.body as Array<Record<string, unknown>>
  check('returns array', true, Array.isArray(list))

  const entry = list.find((nw) => nw.id === namedWorkoutId)
  check('includes our named workout', true, entry !== undefined)
  check('manualResultCount starts at 0', 0, entry?.manualResultCount)
  check('latestResult starts null', null, entry?.latestResult)
}

async function testCreateBenchmarkResult() {
  console.log('\n=== POST /me/benchmarks/:namedWorkoutId/results ===')

  const body = {
    achievedAt: '2024-03-01T09:00:00.000Z',
    level: 'RX',
    workoutGender: 'MALE',
    value: { score: { kind: 'TIME', seconds: 210, cappedOut: false }, movementResults: [] },
    notes: 'First Fran',
  }

  const r = await api('POST', `/me/benchmarks/${namedWorkoutId}/results`, token, body)
  check('201 status', 201, r.status)

  const result = r.body as Record<string, unknown>
  check('has id', true, typeof result.id === 'string')
  check('namedWorkoutName matches', namedWorkoutName, result.namedWorkoutName)
  check('level correct', 'RX', result.level)
  check('primaryScoreKind derived', 'TIME', result.primaryScoreKind)
  check('primaryScoreValue derived', 210, result.primaryScoreValue)

  createdResultIds.push(result.id as string)

  // 404 for non-existent named workout
  const r404 = await api('POST', '/me/benchmarks/does-not-exist/results', token, body)
  check('404 for unknown namedWorkoutId', 404, r404.status)

  // 400 for missing required fields
  const r400 = await api('POST', `/me/benchmarks/${namedWorkoutId}/results`, token, { level: 'RX' })
  check('400 for invalid body', 400, r400.status)
}

async function testListBenchmarksAfterCreate() {
  console.log('\n=== GET /me/benchmarks after creating a result ===')

  const r = await api('GET', '/me/benchmarks', token)
  const list = r.body as Array<Record<string, unknown>>
  const entry = list.find((nw) => nw.id === namedWorkoutId)

  check('manualResultCount is 1', 1, entry?.manualResultCount)
  check('latestResult is set', true, entry?.latestResult !== null)
}

async function testGetBenchmarkDetail() {
  console.log('\n=== GET /me/benchmarks/:namedWorkoutId ===')

  const r = await api('GET', `/me/benchmarks/${namedWorkoutId}`, token)
  check('200 status', 200, r.status)

  const body = r.body as { namedWorkout: Record<string, unknown>; history: Array<Record<string, unknown>> }
  check('has namedWorkout', true, body.namedWorkout?.id === namedWorkoutId)
  check('history is array', true, Array.isArray(body.history))

  // Should have 2 entries: 1 manual + 1 programmed
  check('history has 2 entries', 2, body.history.length)

  const manualEntry = body.history.find((h) => h.source === 'manual')
  const programmedEntry = body.history.find((h) => h.source === 'programmed')

  check('manual entry present', true, manualEntry !== undefined)
  check('programmed entry present', true, programmedEntry !== undefined)
  check('manual entry has correct level', 'RX', manualEntry?.level)
  check('programmed entry has workoutId', programmedWorkoutId, programmedEntry?.workoutId)

  // 404 for unknown named workout
  const r404 = await api('GET', '/me/benchmarks/does-not-exist', token)
  check('404 for unknown namedWorkoutId', 404, r404.status)
}

async function testUpdateBenchmarkResult() {
  console.log('\n=== PATCH /me/benchmarks/:namedWorkoutId/results/:id ===')

  const resultId = createdResultIds[0]!

  const r = await api('PATCH', `/me/benchmarks/${namedWorkoutId}/results/${resultId}`, token, {
    notes: 'Updated notes',
    level: 'SCALED',
  })
  check('200 status', 200, r.status)

  const updated = r.body as Record<string, unknown>
  check('notes updated', 'Updated notes', updated.notes)
  check('level updated', 'SCALED', updated.level)

  // 404 when result doesn't belong to this user
  const rOther = await api('PATCH', `/me/benchmarks/${namedWorkoutId}/results/${resultId}`, otherToken, {
    notes: 'Nope',
  })
  check('404 when patching another user\'s result', 404, rOther.status)

  // 400 for empty patch body
  const r400 = await api('PATCH', `/me/benchmarks/${namedWorkoutId}/results/${resultId}`, token, {})
  check('400 for empty patch', 400, r400.status)
}

async function testDeleteBenchmarkResult() {
  console.log('\n=== DELETE /me/benchmarks/:namedWorkoutId/results/:id ===')

  // Create a result to delete
  const created = await api('POST', `/me/benchmarks/${namedWorkoutId}/results`, token, {
    achievedAt: '2024-04-01T09:00:00.000Z',
    level: 'RX',
    workoutGender: 'MALE',
    value: { score: { kind: 'TIME', seconds: 195, cappedOut: false }, movementResults: [] },
  })
  const toDelete = (created.body as Record<string, unknown>).id as string

  // Other user cannot delete
  const rOther = await api('DELETE', `/me/benchmarks/${namedWorkoutId}/results/${toDelete}`, otherToken)
  check('404 when deleting another user\'s result', 404, rOther.status)

  // Owner can delete
  const r = await api('DELETE', `/me/benchmarks/${namedWorkoutId}/results/${toDelete}`, token)
  check('204 on delete', 204, r.status)

  // Verify it's gone
  const r404 = await api('DELETE', `/me/benchmarks/${namedWorkoutId}/results/${toDelete}`, token)
  check('404 on repeat delete', 404, r404.status)
}

async function cleanup() {
  console.log('\n=== Cleanup ===')
  await prisma.benchmarkResult.deleteMany({ where: { userId } })
  await prisma.result.deleteMany({ where: { userId } })
  await prisma.workout.deleteMany({ where: { id: programmedWorkoutId } })
  await prisma.namedWorkout.deleteMany({ where: { id: namedWorkoutId } })
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } })
  console.log('  done')
}

async function main() {
  await setup()
  try {
    await testAuthGuards()
    await testListBenchmarks()
    await testCreateBenchmarkResult()
    await testListBenchmarksAfterCreate()
    await testGetBenchmarkDetail()
    await testUpdateBenchmarkResult()
    await testDeleteBenchmarkResult()
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
