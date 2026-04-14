/**
 * Lightweight integration tests for the member feed & WOD detail endpoints.
 *
 * Covers the API surface used by the Feed page and WodDetail page (Issue #48):
 *   - GET /gyms/:gymId/workouts → MEMBER sees only PUBLISHED; PROGRAMMER sees all
 *   - GET /workouts/:id → returns full workout data for program subscribers
 *   - GET /workouts/:id/results → leaderboard entries have WorkoutResult shape
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npm test
 */

import { prisma, ProgramRole } from '@berntracker/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = 'http://localhost:3000/api'
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
let memberUserId = ''
let programmerUserId = ''
let memberToken = ''
let programmerToken = ''
let publishedWorkoutId = ''
let draftWorkoutId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `Feed Gym ${TS}`, slug: `feed-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const [memberUser, programmerUser] = await Promise.all([
    prisma.user.create({ data: { email: `feed-member-${TS}@test.com`, name: 'Feed Member' } }),
    prisma.user.create({ data: { email: `feed-prog-${TS}@test.com`, name: 'Feed Programmer' } }),
  ])
  memberUserId = memberUser.id
  programmerUserId = programmerUser.id

  await prisma.userGym.createMany({
    data: [
      { userId: memberUserId, gymId, role: 'MEMBER' },
      { userId: programmerUserId, gymId, role: 'PROGRAMMER' },
    ],
  })

  const program = await prisma.program.create({
    data: {
      name: `Feed Program ${TS}`,
      startDate: new Date('2026-01-01'),
      gyms: { create: { gymId } },
      members: {
        createMany: {
          data: [
            { userId: memberUserId, role: ProgramRole.MEMBER },
            { userId: programmerUserId, role: ProgramRole.PROGRAMMER },
          ],
        },
      },
    },
  })
  programId = program.id

  const SCHEDULED_DATE = new Date('2026-04-15T10:00:00Z')

  const [published, draft] = await Promise.all([
    prisma.workout.create({
      data: {
        title: 'Feed PUBLISHED Workout',
        description: 'Thrusters + pull-ups',
        type: 'FOR_TIME',
        status: 'PUBLISHED',
        scheduledAt: SCHEDULED_DATE,
        programId,
        dayOrder: 0,
      },
    }),
    prisma.workout.create({
      data: {
        title: 'Feed DRAFT Workout',
        description: 'Draft only — should not appear to MEMBERs',
        type: 'STRENGTH',
        status: 'DRAFT',
        scheduledAt: SCHEDULED_DATE,
        programId,
        dayOrder: 1,
      },
    }),
  ])
  publishedWorkoutId = published.id
  draftWorkoutId = draft.id

  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken
  programmerToken = signTokenPair(programmerUserId, 'PROGRAMMER').accessToken

  console.log(`  gym=${gymId}`)
  console.log(`  program=${programId}`)
  console.log(`  publishedWorkout=${publishedWorkoutId}`)
  console.log(`  draftWorkout=${draftWorkoutId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── Feed: gym-scoped workout list ──────────────────────────────────────────
  console.log('\n=== Feed: GET /gyms/:gymId/workouts ===')

  {
    // MEMBER → sees only PUBLISHED workouts
    const r = await api('GET', `/gyms/${gymId}/workouts?from=2026-04-01&to=2026-04-30`, memberToken)
    check('MEMBER GET workouts → 200', 200, r.status)
    const workouts = r.body as Array<Record<string, unknown>>
    check('MEMBER sees only PUBLISHED workouts', true, Array.isArray(workouts))
    const titles = workouts.map((w) => w.title)
    check('MEMBER can see published workout', true, titles.includes('Feed PUBLISHED Workout'))
    check('MEMBER cannot see draft workout', false, titles.includes('Feed DRAFT Workout'))
  }

  {
    // PROGRAMMER → sees DRAFT and PUBLISHED workouts
    const r = await api('GET', `/gyms/${gymId}/workouts?from=2026-04-01&to=2026-04-30`, programmerToken)
    check('PROGRAMMER GET workouts → 200', 200, r.status)
    const workouts = r.body as Array<Record<string, unknown>>
    const titles = workouts.map((w) => w.title)
    check('PROGRAMMER can see published workout', true, titles.includes('Feed PUBLISHED Workout'))
    check('PROGRAMMER can see draft workout', true, titles.includes('Feed DRAFT Workout'))
  }

  {
    // Missing date range params → 400
    const r = await api('GET', `/gyms/${gymId}/workouts`, memberToken)
    check('GET /gyms/:gymId/workouts missing params → 400', 400, r.status)
  }

  {
    // No auth → 401
    const r = await api('GET', `/gyms/${gymId}/workouts?from=2026-04-01&to=2026-04-30`)
    check('GET /gyms/:gymId/workouts no auth → 401', 401, r.status)
  }

  // ── WOD Detail: GET /workouts/:id ──────────────────────────────────────────
  console.log('\n=== WOD Detail: GET /workouts/:id ===')

  {
    const r = await api('GET', `/workouts/${publishedWorkoutId}`, memberToken)
    check('MEMBER GET /workouts/:id (published) → 200', 200, r.status)
    const w = r.body
    check('GET /workouts/:id → has id', publishedWorkoutId, w.id)
    check('GET /workouts/:id → has title', 'Feed PUBLISHED Workout', w.title)
    check('GET /workouts/:id → has type', 'FOR_TIME', w.type)
    check('GET /workouts/:id → has status', 'PUBLISHED', w.status)
    check('GET /workouts/:id → has scheduledAt', true, typeof w.scheduledAt === 'string')
    check('GET /workouts/:id → has _count', true, w._count !== undefined)
  }

  {
    // MEMBER can also access DRAFT workouts for programs they subscribe to
    const r = await api('GET', `/workouts/${draftWorkoutId}`, memberToken)
    check('MEMBER GET /workouts/:id (draft, subscribed) → 200', 200, r.status)
  }

  {
    // User with no program subscription → 403
    const outsider = await prisma.user.create({ data: { email: `feed-outsider-${TS}@test.com` } })
    const outsiderToken = signTokenPair(outsider.id, 'MEMBER').accessToken
    const r = await api('GET', `/workouts/${publishedWorkoutId}`, outsiderToken)
    check('GET /workouts/:id (no program sub) → 403', 403, r.status)
    await prisma.user.delete({ where: { id: outsider.id } })
  }

  // ── Results: GET /workouts/:id/results ──────────────────────────────────────
  console.log('\n=== Results: GET /workouts/:workoutId/results ===')

  // Seed results for the published workout
  await api('POST', `/workouts/${publishedWorkoutId}/results`, memberToken, {
    level: 'RX',
    workoutGender: 'OPEN',
    value: { type: 'FOR_TIME', seconds: 185, cappedOut: false },
  })
  await api('POST', `/workouts/${publishedWorkoutId}/results`, programmerToken, {
    level: 'SCALED',
    workoutGender: 'OPEN',
    value: { type: 'FOR_TIME', seconds: 240, cappedOut: false },
  })

  {
    const r = await api('GET', `/workouts/${publishedWorkoutId}/results`, memberToken)
    check('GET /workouts/:id/results → 200', 200, r.status)
    const entries = r.body as Array<Record<string, unknown>>
    check('GET /workouts/:id/results → array', true, Array.isArray(entries))
    check('GET /workouts/:id/results → 2 entries', 2, entries.length)

    // Verify WorkoutResult shape
    const first = entries[0]
    check('WorkoutResult has id', true, typeof first.id === 'string')
    check('WorkoutResult has userId', true, typeof first.userId === 'string')
    check('WorkoutResult has workoutId', publishedWorkoutId, first.workoutId)
    check('WorkoutResult has level', true, typeof first.level === 'string')
    check('WorkoutResult has workoutGender', true, typeof first.workoutGender === 'string')
    check('WorkoutResult has value', true, typeof first.value === 'object')
    check('WorkoutResult has user.id', true, typeof (first.user as Record<string, unknown>)?.id === 'string')
    check('WorkoutResult has workout.type', 'FOR_TIME', (first.workout as Record<string, unknown>)?.type)

    // FOR_TIME sorted ascending by seconds — member (185s) faster than programmer (240s)
    const firstUser = (first.user as Record<string, unknown>)
    check('FOR_TIME results → faster result first', memberUserId, firstUser.id)
  }

  {
    // Filter by level=RX → 1 result
    const r = await api('GET', `/workouts/${publishedWorkoutId}/results?level=RX`, memberToken)
    const entries = r.body as Array<Record<string, unknown>>
    check('GET /workouts/:id/results ?level=RX → 1 entry', 1, entries.length)
    check('GET /workouts/:id/results ?level=RX → correct level', 'RX', entries[0]?.level)
  }

  {
    // Filter by level=MODIFIED → 0 results
    const r = await api('GET', `/workouts/${publishedWorkoutId}/results?level=MODIFIED`, memberToken)
    const entries = r.body as Array<Record<string, unknown>>
    check('GET /workouts/:id/results ?level=MODIFIED → empty', true, Array.isArray(entries) && entries.length === 0)
  }

  {
    // No auth → 401
    const r = await api('GET', `/workouts/${publishedWorkoutId}/results`)
    check('GET /workouts/:id/results no auth → 401', 401, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { workoutId: { in: [publishedWorkoutId, draftWorkoutId] } } })
  await prisma.workout.deleteMany({ where: { programId } })
  await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: [memberUserId, programmerUserId] } } })
  await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
  console.log('  cleaned up')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
