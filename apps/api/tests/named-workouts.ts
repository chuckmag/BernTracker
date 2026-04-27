/**
 * Lightweight integration tests for NamedWorkout CRUD endpoints and
 * the apply-template action on workouts.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/named-workouts.ts
 *
 * Strategy: seed all fixtures directly via Prisma (no HTTP for setup),
 * sign tokens in-process, then drive assertions through the live API.
 * Teardown runs in a finally block so the DB stays clean on failure.
 */

import { prisma, ProgramRole } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
let pass = 0
let fail = 0

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, body: json as Record<string, unknown> }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let gymId = ''
let programId = ''
let workoutId = ''
let namedWorkoutId = ''
let programmerToken = ''
let memberToken = ''
let thrusterId = ''
let pullUpId = ''

async function setup() {
  const gym = await prisma.gym.create({
    data: { name: `NW Test Gym ${TS}`, slug: `nw-test-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const prog = await prisma.user.create({
    data: {
      email: `nw-prog-${TS}@test.com`,
      name: 'NW Programmer',
      passwordHash: 'x',
      gyms: { create: { gymId: gym.id, role: 'PROGRAMMER' } },
    },
  })
  const member = await prisma.user.create({
    data: {
      email: `nw-member-${TS}@test.com`,
      name: 'NW Member',
      passwordHash: 'x',
      gyms: { create: { gymId: gym.id, role: 'MEMBER' } },
    },
  })

  const program = await prisma.program.create({
    data: {
      name: `NW Program ${TS}`,
      startDate: new Date(),
      gyms: { create: { gymId: gym.id } },
      members: { create: { userId: prog.id, role: ProgramRole.PROGRAMMER } },
    },
  })
  programId = program.id

  // Seed two movements used across movement-related tests
  const thruster = await prisma.movement.upsert({
    where: { name: `NW-Thruster-${TS}` },
    update: {},
    create: { name: `NW-Thruster-${TS}`, status: 'ACTIVE' },
  })
  const pullUp = await prisma.movement.upsert({
    where: { name: `NW-PullUp-${TS}` },
    update: {},
    create: { name: `NW-PullUp-${TS}`, status: 'ACTIVE' },
  })
  thrusterId = thruster.id
  pullUpId = pullUp.id

  const workout = await prisma.workout.create({
    data: {
      title: 'NW Workout',
      description: 'original description',
      type: 'AMRAP',
      scheduledAt: new Date('2030-06-01T12:00:00Z'),
      programId,
    },
  })
  workoutId = workout.id

  const { accessToken: pt } = await signTokenPair(prog.id, prog.email)
  const { accessToken: mt } = await signTokenPair(member.id, member.email)
  programmerToken = pt
  memberToken = mt
}

async function teardown() {
  await prisma.workout.deleteMany({ where: { programId } })
  // Delete any named workouts seeded (template workouts + named workout rows)
  if (namedWorkoutId) {
    const nw = await prisma.namedWorkout.findUnique({ where: { id: namedWorkoutId }, select: { templateWorkoutId: true } })
    await prisma.namedWorkout.delete({ where: { id: namedWorkoutId } }).catch(() => {})
    if (nw?.templateWorkoutId) {
      await prisma.workout.delete({ where: { id: nw.templateWorkoutId } }).catch(() => {})
    }
  }
  // Clean up any other named workouts created during tests
  await prisma.namedWorkout.deleteMany({ where: { name: { contains: `NW-${TS}` } } })
  // Clean up seeded movements
  await prisma.movement.deleteMany({ where: { name: { contains: `-${TS}` } } })
  await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testCreateNamedWorkoutNoTemplate() {
  console.log('\n[POST /named-workouts] — no template')
  const r = await api('POST', '/named-workouts', programmerToken, {
    name: `NW-${TS}-Benchmark`,
    category: 'BENCHMARK',
    aliases: ['bench'],
  })
  check('status 201', 201, r.status)
  check('name matches', `NW-${TS}-Benchmark`, (r.body as Record<string, unknown>).name)
  check('category matches', 'BENCHMARK', (r.body as Record<string, unknown>).category)
  check('templateWorkout is null', 'null', String((r.body as Record<string, unknown>).templateWorkout))
  // cleanup this one inline
  const id = (r.body as Record<string, unknown>).id as string
  await prisma.namedWorkout.delete({ where: { id } }).catch(() => {})
}

async function testCreateNamedWorkoutWithTemplate() {
  console.log('\n[POST /named-workouts] — with template')
  const r = await api('POST', '/named-workouts', programmerToken, {
    name: `NW-${TS}-Fran`,
    category: 'GIRL_WOD',
    aliases: [],
    template: {
      type: 'FOR_TIME',
      description: '21-15-9\nThrusters 95/65\nPull-ups',
      movementIds: [thrusterId, pullUpId],
    },
  })
  check('status 201', 201, r.status)
  check('name matches', `NW-${TS}-Fran`, (r.body as Record<string, unknown>).name)
  check('category matches', 'GIRL_WOD', (r.body as Record<string, unknown>).category)
  const tmpl = (r.body as Record<string, unknown>).templateWorkout as Record<string, unknown> | null
  check('templateWorkout exists', true, tmpl !== null)
  check('template type', 'FOR_TIME', tmpl?.type)
  const wms = tmpl?.workoutMovements as { movement: { id: string } }[] | undefined
  const returnedIds = wms?.map((wm) => wm.movement.id).sort().join(',') ?? ''
  check('template movementIds', [thrusterId, pullUpId].sort().join(','), returnedIds)
  namedWorkoutId = (r.body as Record<string, unknown>).id as string
}

async function testListNamedWorkouts() {
  console.log('\n[GET /named-workouts]')
  const r = await api('GET', '/named-workouts', programmerToken)
  check('status 200', 200, r.status)
  check('returns array', true, Array.isArray(r.body))
  const list = r.body as unknown as Record<string, unknown>[]
  const found = list.find((nw) => nw.id === namedWorkoutId)
  check('created named workout in list', true, found !== undefined)
}

async function testGetNamedWorkout() {
  console.log('\n[GET /named-workouts/:id]')
  const r = await api('GET', `/named-workouts/${namedWorkoutId}`, programmerToken)
  check('status 200', 200, r.status)
  check('id matches', namedWorkoutId, (r.body as Record<string, unknown>).id)
  const tmpl = (r.body as Record<string, unknown>).templateWorkout as Record<string, unknown> | null
  check('templateWorkout included', true, tmpl !== null)
}

async function testPatchNamedWorkout() {
  console.log('\n[PATCH /named-workouts/:id] — update isActive')
  const r = await api('PATCH', `/named-workouts/${namedWorkoutId}`, programmerToken, {
    isActive: false,
  })
  check('status 200', 200, r.status)
  check('isActive false', 'false', String((r.body as Record<string, unknown>).isActive))
  // Restore active so it still shows in list
  await api('PATCH', `/named-workouts/${namedWorkoutId}`, programmerToken, { isActive: true })
}

async function testPatchWorkoutWithMovementsAndNamedWorkout() {
  console.log('\n[PATCH /workouts/:id] — movementIds + namedWorkoutId')
  const r = await api('PATCH', `/workouts/${workoutId}`, programmerToken, {
    movementIds: [thrusterId, pullUpId],
    namedWorkoutId,
  })
  check('status 200', 200, r.status)
  const wms = (r.body as Record<string, unknown>).workoutMovements as { movement: { id: string; name: string } }[] | undefined
  const returnedIds = wms?.map((wm) => wm.movement.id).sort().join(',') ?? ''
  check('workoutMovements set', [thrusterId, pullUpId].sort().join(','), returnedIds)
  check('namedWorkoutId set', namedWorkoutId, (r.body as Record<string, unknown>).namedWorkoutId)
  const nw = (r.body as Record<string, unknown>).namedWorkout as Record<string, unknown> | null
  check('namedWorkout included', true, nw !== null)
  check('namedWorkout name', `NW-${TS}-Fran`, nw?.name)
}

async function testGetWorkoutIncludesNewFields() {
  console.log('\n[GET /workouts/:id] — includes workoutMovements + namedWorkout')
  const r = await api('GET', `/workouts/${workoutId}`, programmerToken)
  check('status 200', 200, r.status)
  const wms = (r.body as Record<string, unknown>).workoutMovements as { movement: { id: string } }[] | undefined
  const returnedIds = wms?.map((wm) => wm.movement.id).sort().join(',') ?? ''
  check('workoutMovements present', [thrusterId, pullUpId].sort().join(','), returnedIds)
  const nw = (r.body as Record<string, unknown>).namedWorkout as Record<string, unknown> | null
  check('namedWorkout present', true, nw !== null)
  check('namedWorkout category', 'GIRL_WOD', nw?.category)
}

async function testApplyTemplate() {
  console.log('\n[POST /workouts/:id/apply-template]')
  const r = await api('POST', `/workouts/${workoutId}/apply-template`, programmerToken)
  check('status 200', 200, r.status)
  check('type copied from template', 'FOR_TIME', (r.body as Record<string, unknown>).type)
  check('description copied from template', '21-15-9\nThrusters 95/65\nPull-ups', (r.body as Record<string, unknown>).description)
  const wms = (r.body as Record<string, unknown>).workoutMovements as { movement: { id: string } }[] | undefined
  const returnedIds = wms?.map((wm) => wm.movement.id).sort().join(',') ?? ''
  check('movements copied from template', [thrusterId, pullUpId].sort().join(','), returnedIds)
}

async function testApplyTemplateNoNamedWorkout() {
  console.log('\n[POST /workouts/:id/apply-template] — no named workout → 400')
  // Clear namedWorkoutId first
  await api('PATCH', `/workouts/${workoutId}`, programmerToken, { namedWorkoutId: null })
  const r = await api('POST', `/workouts/${workoutId}/apply-template`, programmerToken)
  check('status 400', 400, r.status)
}

async function testRequireAuth() {
  console.log('\n[Auth guards]')
  const r1 = await api('GET', '/named-workouts')
  check('GET /named-workouts requires auth → 401', 401, r1.status)
  const r2 = await api('POST', '/named-workouts')
  check('POST /named-workouts requires auth → 401', 401, r2.status)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Setting up fixtures...')
  await setup()

  try {
    await testCreateNamedWorkoutNoTemplate()
    await testCreateNamedWorkoutWithTemplate()
    await testListNamedWorkouts()
    await testGetNamedWorkout()
    await testPatchNamedWorkout()
    await testPatchWorkoutWithMovementsAndNamedWorkout()
    await testGetWorkoutIncludesNewFields()
    await testApplyTemplate()
    await testApplyTemplateNoNamedWorkout()
    await testRequireAuth()
  } finally {
    console.log('\nTearing down fixtures...')
    await teardown()
    await prisma.$disconnect()
  }

  console.log(`\nResults: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
