/**
 * Lightweight integration tests for result logging & leaderboard endpoints.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npm test
 *
 * Strategy: seed all fixtures directly via Prisma, sign tokens in-process,
 * drive assertions through the live API, clean up in a finally block.
 */

import { prisma } from '@wodalytics/db'
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
let strengthWorkoutId = ''
let strengthMovementWmIdA = ''
let strengthMovementWmIdB = ''
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
        tracksRounds: true,
      },
    }),
  ])
  forTimeWorkoutId = forTimeWorkout.id
  amrapWorkoutId = amrapWorkout.id

  // Strength fixture: a workout with two prescribed movements (Back Squat,
  // RDL). The unique-name nonce dodges collisions with parallel test workers
  // and any seeded movement library.
  const backSquat = await prisma.movement.upsert({
    where: { name: 'Back Squat' },
    create: { name: 'Back Squat', status: 'ACTIVE' },
    update: {},
  })
  const rdl = await prisma.movement.upsert({
    where: { name: 'RDL' },
    create: { name: 'RDL', status: 'ACTIVE' },
    update: {},
  })
  const strengthWorkout = await prisma.workout.create({
    data: {
      title: `AT STRENGTH ${TS}`,
      description: 'Integration test strength session',
      type: 'POWER_LIFTING',
      scheduledAt: new Date('2026-03-15T10:00:00Z'),
      workoutMovements: {
        create: [
          { movementId: backSquat.id, displayOrder: 0, sets: 5, reps: '5', load: 225, loadUnit: 'LB', tempo: '3.1.1.0' },
          { movementId: rdl.id,       displayOrder: 1, sets: 5, reps: '10', load: 135, loadUnit: 'LB' },
        ],
      },
    },
    include: { workoutMovements: true },
  })
  strengthWorkoutId = strengthWorkout.id
  // The (workoutId, movementId) tuple keys back to the WorkoutMovement row.
  // Tests below use these to address per-movement set tables in `value`.
  strengthMovementWmIdA = strengthWorkout.workoutMovements.find((wm) => wm.movementId === backSquat.id)!.movementId
  strengthMovementWmIdB = strengthWorkout.workoutMovements.find((wm) => wm.movementId === rdl.id)!.movementId

  console.log(`  userA=${userAId}`)
  console.log(`  userB=${userBId}`)
  console.log(`  forTimeWorkout=${forTimeWorkoutId}`)
  console.log(`  amrapWorkout=${amrapWorkoutId}`)
  console.log(`  strengthWorkout=${strengthWorkoutId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  // ── POST /api/workouts/:workoutId/results ──────────────────────────────────
  console.log('\n=== POST /workouts/:workoutId/results ===')

  {
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'TIME', seconds: 300, cappedOut: false } },
    })
    check('POST FOR_TIME result → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    check('POST FOR_TIME result → has id', true, typeof body.id === 'string')
    check('POST FOR_TIME result → level=RX', 'RX', body.level)
    check('POST FOR_TIME result → primaryScoreKind=TIME', 'TIME', body.primaryScoreKind)
    check('POST FOR_TIME result → primaryScoreValue=300', 300, body.primaryScoreValue)
    resultId = body.id as string
  }

  {
    // Capped-out result gets the time-cap penalty addend (so it sorts after
    // every finisher).
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userBToken, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'TIME', seconds: 600, cappedOut: true } },
    })
    check('POST capped FOR_TIME → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    check('POST capped FOR_TIME → primaryScoreValue includes cap penalty', true, (body.primaryScoreValue as number) > 1_000_000_000)
  }

  {
    // Duplicate: same user, same workout → 409
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'TIME', seconds: 280, cappedOut: false } },
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
    // Empty value (no score, no movementResults) → 400 via the refine
    const r = await api('POST', `/workouts/${amrapWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'OPEN',
      value: { movementResults: [] },
    })
    check('POST empty value → 400', 400, r.status)
  }

  {
    // Reps regex: "1.1.1" cluster passes, "abc" is rejected
    const r = await api('POST', `/workouts/${strengthWorkoutId}/results`, userBToken, {
      level: 'RX',
      workoutGender: 'OPEN',
      value: {
        movementResults: [
          {
            workoutMovementId: strengthMovementWmIdA,
            loadUnit: 'LB',
            sets: [{ reps: 'abc', load: 100 }],
          },
        ],
      },
    })
    check('POST reps="abc" → 400', 400, r.status)
  }

  {
    // No auth → 401
    const r = await api('POST', `/workouts/${forTimeWorkoutId}/results`, undefined, {
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'TIME', seconds: 300, cappedOut: false } },
    })
    check('POST results (no auth) → 401', 401, r.status)
  }

  // ── AMRAP scoring (rounds*1000 + reps) ────────────────────────────────────
  console.log('\n=== AMRAP scoring + leaderboard ===')

  {
    const r1 = await api('POST', `/workouts/${amrapWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'OPEN',
      value: { score: { kind: 'ROUNDS_REPS', rounds: 5, reps: 10, cappedOut: false } },
    })
    check('POST AMRAP rounds=5 reps=10 → primaryScoreValue=5010', 5010, (r1.body as Record<string, unknown>).primaryScoreValue)

    const r2 = await api('POST', `/workouts/${amrapWorkoutId}/results`, userBToken, {
      level: 'RX',
      workoutGender: 'OPEN',
      value: { score: { kind: 'ROUNDS_REPS', rounds: 6, reps: 3, cappedOut: false } },
    })
    check('POST AMRAP rounds=6 reps=3  → primaryScoreValue=6003', 6003, (r2.body as Record<string, unknown>).primaryScoreValue)
  }

  {
    // Leaderboard sorted by primaryScoreValue desc — userB (6003) beats userA (5010)
    const r = await api('GET', `/workouts/${amrapWorkoutId}/results`, userAToken)
    const entries = r.body as Array<Record<string, unknown>>
    check('AMRAP leaderboard → 2 entries', 2, entries.length)
    const first = (entries[0] as Record<string, unknown>).user as Record<string, unknown>
    check('AMRAP leaderboard → most rounds first (userB)', userBId, first.id)
  }

  // ── FOR_TIME leaderboard ranking ──────────────────────────────────────────
  console.log('\n=== FOR_TIME leaderboard ===')

  {
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results`, userAToken)
    check('GET leaderboard → 200', 200, r.status)
    const entries = r.body as Array<Record<string, unknown>>
    check('GET FOR_TIME leaderboard → 2 entries', 2, entries.length)
    // userA finished at 300s; userB capped out — finisher beats capped.
    const first = (entries[0] as Record<string, unknown>).user as Record<string, unknown>
    check('FOR_TIME leaderboard → finisher beats capped', userAId, first.id)
  }

  {
    // Filter by level=SCALED — no results seeded at SCALED
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results?level=SCALED`, userAToken)
    check('GET leaderboard ?level=SCALED → empty array', true, Array.isArray(r.body) && (r.body as unknown[]).length === 0)
  }

  {
    // No auth → 401
    const r = await api('GET', `/workouts/${forTimeWorkoutId}/results`)
    check('GET leaderboard (no auth) → 401', 401, r.status)
  }

  // ── Strength scoring (max load*reps across sets) ──────────────────────────
  console.log('\n=== Strength scoring (movementResults) ===')

  {
    // userA: heaviest set is 245 lb x 1 = 245 lb. After conversion to kg
    // (245 * 0.453592) ≈ 111.1 kg. Other set 235 x 5 = 1175 lb (≈ 533 kg)
    // is heavier — best score should be 235 * 5 = 1175 lb → ~533 kg.
    const r = await api('POST', `/workouts/${strengthWorkoutId}/results`, userAToken, {
      level: 'RX',
      workoutGender: 'OPEN',
      value: {
        movementResults: [
          {
            workoutMovementId: strengthMovementWmIdA,
            loadUnit: 'LB',
            sets: [
              { reps: '5', load: 225, tempo: '3.1.1.0' },
              { reps: '5', load: 235, tempo: '3.1.1.0' },
              { reps: '1.1.1', load: 245, tempo: '3.1.1.0' },
            ],
          },
          {
            workoutMovementId: strengthMovementWmIdB,
            loadUnit: 'LB',
            sets: [
              { reps: '10', load: 135 },
              { reps: '10', load: 135 },
            ],
          },
        ],
      },
    })
    check('POST strength result → 201', 201, r.status)
    const body = r.body as Record<string, unknown>
    check('POST strength → primaryScoreKind=LOAD', 'LOAD', body.primaryScoreKind)
    // The crude "max load × maxRepChunk" rule scans every set; the heaviest
    // tonnage set wins regardless of movement. Here that's the RDL set
    // (135 lb × 10 reps = 1350 lb-reps), not the back squat (235 × 5 = 1175).
    // Cluster reps `1.1.1` collapse to maxChunk=1, so the 245 × 1 single
    // doesn't outrank either. This is exactly the case slice 4 will revisit
    // when we move to a 1RM-estimate-based primary score.
    const expectedKg = 135 * 10 * 0.453592
    const got = body.primaryScoreValue as number
    check('POST strength → primaryScoreValue ≈ max(load*reps in kg)', true, Math.abs(got - expectedKg) < 0.01)
  }

  // ── GET /api/me/results (history) ─────────────────────────────────────────
  console.log('\n=== GET /me/results (paginated history) ===')

  {
    const r = await api('GET', '/me/results', userAToken)
    check('GET /me/results → 200', 200, r.status)
    const body = r.body as Record<string, unknown>
    check('GET /me/results → has results array', true, Array.isArray(body.results))
    // userA has FOR_TIME, AMRAP, and STRENGTH results → 3 total.
    check('GET /me/results → userA has 3 results', 3, (body.results as unknown[]).length)
    check('GET /me/results → total=3', 3, body.total)
    check('GET /me/results → page=1', 1, body.page)
  }

  {
    // No auth → 401
    const r = await api('GET', '/me/results')
    check('GET /me/results (no auth) → 401', 401, r.status)
  }

  // ── PATCH /api/results/:id recomputes primary score ────────────────────────
  console.log('\n=== PATCH /results/:id ===')

  {
    const r = await api('PATCH', `/results/${resultId}`, userAToken, {
      value: { score: { kind: 'TIME', seconds: 250, cappedOut: false } },
    })
    check('PATCH result with new value → 200', 200, r.status)
    const body = r.body as Record<string, unknown>
    check('PATCH → primaryScoreValue recomputed to 250', 250, body.primaryScoreValue)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.result.deleteMany({ where: { userId: { in: [userAId, userBId] } } })
  // workoutMovement rows cascade-delete with the workout
  await prisma.workout.deleteMany({ where: { id: { in: [forTimeWorkoutId, amrapWorkoutId, strengthWorkoutId] } } })
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
