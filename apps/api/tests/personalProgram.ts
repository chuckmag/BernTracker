/**
 * Integration tests for the Personal Programs endpoints (#183).
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible via DATABASE_URL.
 * Run from apps/api/: npx tsx tests/personalProgram.ts
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
let userAId = ''
let userBId = ''
let userATok = ''
let userBTok = ''
let movementId = ''
const createdProgramIds: string[] = []
const createdWorkoutIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: `pp-a-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `pp-b-${TS}@test.com` } }),
  ])
  userAId = a.id
  userBId = b.id
  userATok = signTokenPair(userAId, 'MEMBER').accessToken
  userBTok = signTokenPair(userBId, 'MEMBER').accessToken

  const movement = await prisma.movement.create({
    data: { name: `pp-mov-${TS}`, status: 'ACTIVE' },
  })
  movementId = movement.id

  console.log(`  userA=${userAId} userB=${userBId} movement=${movementId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testAuthGuards() {
  console.log('\n=== Auth guards ===')
  const r1 = await api('GET', '/me/personal-program')
  check('GET /me/personal-program no token → 401', 401, r1.status)

  const r2 = await api('GET', '/me/personal-program/workouts')
  check('GET workouts no token → 401', 401, r2.status)

  const r3 = await api('POST', '/me/personal-program/workouts', undefined, {
    title: 'x', description: 'x', type: 'WARMUP', scheduledAt: new Date().toISOString(),
  })
  check('POST workouts no token → 401', 401, r3.status)
}

async function testUpsert() {
  console.log('\n=== Upsert + idempotency ===')
  const first = await api('GET', '/me/personal-program', userATok)
  check('first GET → 200', 200, first.status)
  check('returned ownerUserId matches caller', userAId, first.body.ownerUserId)
  check('visibility is PRIVATE', 'PRIVATE', first.body.visibility)
  check('name is "Personal Program"', 'Personal Program', first.body.name)
  const programId = first.body.id as string
  createdProgramIds.push(programId)

  const sub = await prisma.userProgram.findUnique({
    where: { userId_programId: { userId: userAId, programId } },
  })
  check('userProgram row exists', true, !!sub)
  check('userProgram role is PROGRAMMER', 'PROGRAMMER', sub?.role)

  const second = await api('GET', '/me/personal-program', userATok)
  check('second GET → 200', 200, second.status)
  check('second GET returns same id', programId, second.body.id)

  const gp = await prisma.gymProgram.count({ where: { programId } })
  check('zero GymProgram links', 0, gp)
}

async function testWorkoutCreate() {
  console.log('\n=== Create workout ===')
  const r = await api('POST', '/me/personal-program/workouts', userATok, {
    title: 'Z2 row',
    description: '20 min easy row',
    type: 'ROWING',
    scheduledAt: new Date().toISOString(),
    movementIds: [movementId],
  })
  check('POST workouts → 201', 201, r.status)
  const workoutId = r.body.id as string
  createdWorkoutIds.push(workoutId)
  check('workout has personal program id', true, typeof r.body.programId === 'string' && r.body.programId.length > 0)
  check('workout title persisted', 'Z2 row', r.body.title)

  const spoofed = await api('POST', '/me/personal-program/workouts', userATok, {
    programId: 'nonexistent-program-id',
    title: 'spoof attempt',
    description: 'should still land in personal program',
    type: 'WARMUP',
    scheduledAt: new Date().toISOString(),
  })
  check('spoofed programId still 201', 201, spoofed.status)
  check('spoofed programId was overridden', r.body.programId, spoofed.body.programId)
  if (typeof spoofed.body.id === 'string') createdWorkoutIds.push(spoofed.body.id)

  const bad = await api('POST', '/me/personal-program/workouts', userATok, {
    description: 'no title', type: 'WARMUP', scheduledAt: new Date().toISOString(),
  })
  check('missing title → 400', 400, bad.status)
}

async function testDateRangeFilter() {
  console.log('\n=== Date-range filter (calendar paging) ===')
  const programId = createdProgramIds[0]

  const may = await prisma.workout.create({
    data: {
      programId,
      title: `pp-may-${TS}`,
      description: 'May workout',
      type: 'METCON',
      scheduledAt: new Date('2026-05-15T12:00:00Z'),
    },
  })
  const june = await prisma.workout.create({
    data: {
      programId,
      title: `pp-june-${TS}`,
      description: 'June workout',
      type: 'METCON',
      scheduledAt: new Date('2026-06-15T12:00:00Z'),
    },
  })
  createdWorkoutIds.push(may.id, june.id)

  const mayWindow = await api(
    'GET',
    '/me/personal-program/workouts?from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z',
    userATok,
  )
  check('GET ?from=&to= May window → 200', 200, mayWindow.status)
  const mayList = mayWindow.body as unknown as Array<{ id: string }>
  check('May window includes May workout', true, mayList.some((w) => w.id === may.id))
  check('May window excludes June workout', false, mayList.some((w) => w.id === june.id))

  const allList = await api('GET', '/me/personal-program/workouts', userATok)
  const allRows = allList.body as unknown as Array<{ id: string }>
  check('no-filter list still includes both', true,
    allRows.some((w) => w.id === may.id) && allRows.some((w) => w.id === june.id))

  const mismatched = await api('GET', '/me/personal-program/workouts?from=2026-05-01', userATok)
  check('only `from` (no `to`) → 400', 400, mismatched.status)

  const badDate = await api(
    'GET',
    '/me/personal-program/workouts?from=not-a-date&to=also-not',
    userATok,
  )
  check('invalid date format → 400', 400, badDate.status)
}

async function testIsolation() {
  console.log('\n=== Isolation between users ===')
  const b = await api('GET', '/me/personal-program', userBTok)
  check('user B GET → 200', 200, b.status)
  const bProgramId = b.body.id as string
  createdProgramIds.push(bProgramId)
  check('user B has different programId from user A', true, bProgramId !== createdProgramIds[0])

  const list = await api('GET', '/me/personal-program/workouts', userBTok)
  check('user B sees empty workout list', 0, (list.body as unknown as unknown[]).length)

  const aWorkoutId = createdWorkoutIds[0]
  const denied = await api('GET', `/workouts/${aWorkoutId}`, userBTok)
  check('user B GET /workouts/<A-workout> → 403', 403, denied.status)

  const allowed = await api('GET', `/workouts/${aWorkoutId}`, userATok)
  check('user A GET /workouts/<A-workout> → 200', 200, allowed.status)
}

async function testEdit() {
  console.log('\n=== Edit + delete via existing /workouts/:id route ===')
  const wid = createdWorkoutIds[0]
  const patch = await api('PATCH', `/workouts/${wid}`, userATok, { title: 'Z2 row (edited)' })
  check('user A PATCH → 200', 200, patch.status)
  check('title updated', 'Z2 row (edited)', patch.body.title)

  const denied = await api('PATCH', `/workouts/${wid}`, userBTok, { title: 'hijack' })
  check('user B PATCH → 403', 403, denied.status)

  const del = await api('DELETE', `/workouts/${wid}`, userATok)
  check('user A DELETE → 204', 204, del.status)
  createdWorkoutIds.splice(createdWorkoutIds.indexOf(wid), 1)
}

async function testNotPubliclyDiscoverable() {
  console.log('\n=== Not publicly discoverable ===')
  const r = await api('GET', '/programs/public-catalog', userBTok)
  check('GET public-catalog → 200', 200, r.status)
  const list = r.body as unknown as Array<{ ownerUserId: string | null }>
  const leaked = list.some((p) => p.ownerUserId !== null && p.ownerUserId !== undefined)
  check('no personal programs surface in public-catalog', false, leaked)
}

async function runTests() {
  await testAuthGuards()
  await testUpsert()
  await testWorkoutCreate()
  await testDateRangeFilter()
  await testIsolation()
  await testEdit()
  await testNotPubliclyDiscoverable()
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  for (const wid of createdWorkoutIds) {
    await prisma.workout.delete({ where: { id: wid } }).catch(() => {})
  }
  for (const pid of createdProgramIds) {
    await prisma.workout.deleteMany({ where: { programId: pid } }).catch(() => {})
    await prisma.userProgram.deleteMany({ where: { programId: pid } }).catch(() => {})
    await prisma.program.delete({ where: { id: pid } }).catch(() => {})
  }
  await prisma.movement.delete({ where: { id: movementId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } }).catch(() => {})
  console.log('  cleaned up')
}

async function main() {
  try {
    await setup()
    await runTests()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
