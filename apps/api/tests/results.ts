/**
 * Lightweight integration tests for result logging & leaderboard endpoints.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npm test
 *
 * Strategy: seed all fixtures directly via Prisma, sign tokens in-process,
 * drive assertions through the live API, clean up in a finally block.
 */

import { prisma } from '@berntracker/db'
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
  return { status: res.status, body: json as Record<string, unknown> & unknown[] }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let userAId = ''
let userBId = ''
let userAToken = ''
let userBToken = ''
let forTimeWorkoutId = ''
let amrapWorkoutId = ''
let resultId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `at-result-a-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `at-result-b-${TS}@test.com` } }),
  ])
  userAId = userA.id
  userBId = userB.id

  userAToken = signTokenPair(userAId, 'MEMBER').accessToken
  userBToken = signTokenPair(userBId, 'MEMBER').accessToken

  const [forTimeWorkout, amrapWorkout] = await Promise.all([
    prisma.workout.create({
      data: {
        title: `AT FOR_TIME ${TS}`,
        description: 'Integration test FOR_TIME workout',
        type: 'FOR_TIME',
        scheduledAt: new Date('2026-03-15T10:00:00Z'),
      },
    }),
    prisma.workout.create({
      data: {
        title: `AT AMRAP ${TS}`,
        description: 'Integration test AMRAP workout',
        type: 'AMRAP',
        scheduledAt: new Date('2026-03-15T10:00:00Z'),
      },
    }),
  ])
  forTimeWorkoutId = forTimeWorkout.id
  amrapWorkoutId = amrapWorkout.id

  console.log(`  userA=${userAId}`)
  console.log(`  userB=${userBId}`)
  console.log(`  forTimeWorkout=${forTimeWorkoutId}`)
  console.log(`  amrapWorkout=${amrapWorkoutId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── POST /api/workouts/:workoutId/results ──────────────────────────────────
  console.log('\n=== POST /workouts/:workoutId/results ===')

  {
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { type: 'FOR_TIME', seconds: 300, cappedOut: false },
    })
    check('POST results → 201', 201, r.status)
    check('POST results → has id', true, typeof (r.body as Record<string, unknown>).id === 'string')
    check('POST results → level=RX', 'RX', (r.body as Record<string, unknown>).level)
    resultId = (r.body as Record<string, unknown>).id as string
  }

  {
    // Duplicate: same user, same workout → 409
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { type: 'FOR_TIME', seconds: 280, cappedOut: false },
    })
    check('POST results (duplicate) → 409', 409, r.status)
  }

  {
    // Bad payload → 400
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userAToken, {
      level: 'INVALID',
    })
    check('POST results (bad payload) → 400', 400, r.status)
  }

  {
    // No auth → 401
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, undefined, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { seconds: 300, cappedOut: false },
    })
    check('POST results (no auth) → 401', 401, r.status)
  }

  // ── GET /api/workouts/:workoutId/results (leaderboard) ────────────────────
  console.log('\n=== GET /workouts/:workoutId/results (leaderboard) ===')

  // Seed a second FOR_TIME result (userB, faster) and two AMRAP results
  await api('POST', `/workouts/${forTimeWorkoutId}/results`, userBToken, {
    level: 'RX',
    workoutGender: 'MALE',
    value: { type: 'FOR_TIME', seconds: 240, cappedOut: false },
  })
  await api('POST', `/workouts/${amrapWorkoutId}/results`, userAToken, {
    level: 'RX',
    workoutGender: 'OPEN',
    value: { type: 'AMRAP', rounds: 5, reps: 10 },
  })
  await api('POST', `/workouts/${amrapWorkoutId}/results`, userBToken, {
    level: 'RX',
    workoutGender: 'OPEN',
    value: { type: 'AMRAP', rounds: 6, reps: 3 },
  })

  {
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results`, userAToken)
    check('GET leaderboard → 200', 200, r.status)
    check('GET leaderboard → array', true, Array.isArray(r.body))
    const entries = r.body as Array<Record<string, unknown>>
    check('GET leaderboard → 2 entries', 2, entries.length)
    // FOR_TIME sorted ascending by seconds — userB (240s) beats userA (300s)
    const first = (entries[0] as Record<string, unknown>).user as Record<string, unknown>
    check('FOR_TIME leaderboard → fastest first (userB)', userBId, first.id)
  }

  {
    // AMRAP sorted by rounds desc — userB (6 rounds) beats userA (5 rounds)
    const r = await api('GET', `/workouts/${amrapWorkoutId}/results`, userAToken)
    const entries = r.body as Array<Record<string, unknown>>
    check('AMRAP leaderboard → 2 entries', 2, entries.length)
    const first = (entries[0] as Record<string, unknown>).user as Record<string, unknown>
    check('AMRAP leaderboard → most rounds first (userB)', userBId, first.id)
  }

  {
    // Filter by level=SCALED — no results seeded at SCALED
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results?level=SCALED`, userAToken)
    check('GET leaderboard ?level=SCALED → empty array', true, Array.isArray(r.body) && (r.body as unknown[]).length === 0)
  }

  {
    // Filter by gender=FEMALE — no results seeded as FEMALE
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results?gender=FEMALE`, userAToken)
    check('GET leaderboard ?gender=FEMALE → empty array', true, Array.isArray(r.body) && (r.body as unknown[]).length === 0)
  }

  {
    // No auth → 401
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results`)
    check('GET leaderboard (no auth) → 401', 401, r.status)
  }

  // ── GET /api/me/results (history) ─────────────────────────────────────────
  console.log('\n=== GET /me/results (paginated history) ===')

  {
    const r = await api('GET', '/me/results', userAToken)
    check('GET /me/results → 200', 200, r.status)
    const body = r.body as Record<string, unknown>
    check('GET /me/results → has results array', true, Array.isArray(body.results))
    check('GET /me/results → userA has 2 results (FOR_TIME + AMRAP)', 2, (body.results as unknown[]).length)
    check('GET /me/results → total=2', 2, body.total)
    check('GET /me/results → page=1', 1, body.page)
  }

  {
    // Pagination: limit=1 → page 1 of 2
    const r = await api('GET', '/me/results?page=1&limit=1', userAToken)
    const body = r.body as Record<string, unknown>
    check('GET /me/results ?limit=1 → 1 result', 1, (body.results as unknown[]).length)
    check('GET /me/results ?limit=1 → pages=2', 2, body.pages)
  }

  {
    // No auth → 401
    const r = await api('GET', '/me/results')
    check('GET /me/results (no auth) → 401', 401, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
  await prisma.workout.deleteMany({ where: { id: { in: [forTimeWorkoutId, amrapWorkoutId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } })
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
