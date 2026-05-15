/**
 * Integration tests for user workout plan endpoints.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npm test
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

async function req(method: string, path: string, token?: string, body?: unknown) {
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
  return { status: res.status, body: json as Record<string, unknown> & unknown[] }
}

const TS = Date.now()
let memberId = ''
let coachId  = ''
let nonMemberId = ''
let memberToken  = ''
let coachToken   = ''
let nonMemberToken = ''
let workoutId = ''
let movementId = ''
let workoutMovementId = ''
let gymId = ''
let programId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const [member, coach, nonMember] = await Promise.all([
    prisma.user.create({ data: { email: `at-plans-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `at-plans-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `at-plans-nonmember-${TS}@test.com` } }),
  ])
  memberId    = member.id
  coachId     = coach.id
  nonMemberId = nonMember.id

  memberToken    = signTokenPair(memberId,    'MEMBER').accessToken
  coachToken     = signTokenPair(coachId,     'MEMBER').accessToken
  nonMemberToken = signTokenPair(nonMemberId, 'MEMBER').accessToken

  const gym = await prisma.gym.create({
    data: { name: `AT Plans Gym ${TS}`, slug: `at-plans-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id

  const movement = await prisma.movement.create({
    data: { name: `AT Plans Squat ${TS}` },
  })
  movementId = movement.id

  const program = await prisma.program.create({
    data: {
      name: `AT Plans Program ${TS}`,
      startDate: new Date('2026-01-01'),
      gyms: { create: { gymId } },
    },
  })
  programId = program.id

  await Promise.all([
    prisma.userGym.create({ data: { userId: memberId, gymId, role: 'MEMBER' } }),
    prisma.userGym.create({ data: { userId: coachId,  gymId, role: 'COACH'  } }),
    prisma.userProgram.create({ data: { userId: memberId, programId, role: 'MEMBER'     } }),
    prisma.userProgram.create({ data: { userId: coachId,  programId, role: 'PROGRAMMER' } }),
  ])

  const workout = await prisma.workout.create({
    data: {
      title: `AT Plans Workout ${TS}`,
      description: '',
      type: 'STRENGTH',
      scheduledAt: new Date('2026-05-14'),
      programId,
      workoutMovements: {
        create: {
          movementId,
          displayOrder: 0,
          sets: 3,
          reps: '5',
          load: 225,
          loadUnit: 'LB',
          tracksLoad: true,
        },
      },
    },
    include: { workoutMovements: true },
  })
  workoutId         = workout.id
  workoutMovementId = workout.workoutMovements[0].movementId

  console.log(`  gym=${gymId}  workout=${workoutId}  movement=${movementId}`)
}

async function teardown() {
  await prisma.userWorkoutPlan.deleteMany({ where: { workoutId } })
  await prisma.workout.delete({ where: { id: workoutId } })
  await prisma.movement.delete({ where: { id: movementId } })
  await prisma.userProgram.deleteMany({ where: { programId } })
  await prisma.userGym.deleteMany({ where: { gymId } })
  await prisma.gymProgram.deleteMany({ where: { gymId } })
  await prisma.program.delete({ where: { id: programId } })
  await prisma.gym.delete({ where: { id: gymId } })
  await prisma.user.deleteMany({ where: { id: { in: [memberId, coachId, nonMemberId] } } })
}

async function main() {
  try {
    await setup()

    const planBody = {
      level: 'RX',
      value: {
        movementResults: [
          {
            workoutMovementId,
            loadUnit: 'LB',
            distanceUnit: 'M',
            sets: [
              { reps: '5', load: 185 },
              { reps: '5', load: 185 },
              { reps: '5', load: 185 },
            ],
          },
        ],
      },
      notes: 'Focus on depth',
    }

    // ── Unauthenticated ──────────────────────────────────────────────────────

    console.log('\n=== Unauthenticated ===')
    {
      const r = await req('PUT', `/workouts/${workoutId}/plans/${memberId}`, undefined, planBody)
      check('PUT without auth → 401', 401, r.status)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${memberId}`)
      check('GET without auth → 401', 401, r.status)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans`)
      check('GET list without auth → 401', 401, r.status)
    }

    // ── Member creates their own plan ────────────────────────────────────────

    console.log('\n=== Member upserts own plan ===')
    {
      const r = await req('PUT', `/workouts/${workoutId}/plans/${memberId}`, memberToken, planBody)
      check('PUT own plan → 200', 200, r.status)
      check('PUT own plan → level RX', 'RX', (r.body as any).level)
      check('PUT own plan → notes set', 'Focus on depth', (r.body as any).notes)
      check('PUT own plan → userId matches', memberId, (r.body as any).userId)
    }

    // ── Member reads their own plan ──────────────────────────────────────────

    console.log('\n=== Member reads own plan ===')
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${memberId}`, memberToken)
      check('GET own plan → 200', 200, r.status)
      check('GET own plan → level RX', 'RX', (r.body as any).level)
      check('GET own plan → has movementResults', true, Array.isArray((r.body as any).value?.movementResults))
      check('GET own plan → 3 sets', 3, (r.body as any).value?.movementResults?.[0]?.sets?.length)
    }

    // ── Member cannot access another user's plan ─────────────────────────────

    console.log("\n=== Member cannot access other user's plan ===")
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${coachId}`, memberToken)
      check('GET other member plan → 403', 403, r.status)
    }
    {
      const r = await req('PUT', `/workouts/${workoutId}/plans/${coachId}`, memberToken, planBody)
      check('PUT plan for other member → 403', 403, r.status)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans`, memberToken)
      check('GET all plans as MEMBER → 403', 403, r.status)
    }

    // ── Non-member cannot access plans ───────────────────────────────────────

    console.log('\n=== Non-member access ===')
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${memberId}`, nonMemberToken)
      check('GET plan as non-member → 403 or 404', true, r.status === 403 || r.status === 404)
    }

    // ── Coach manages plans for members ──────────────────────────────────────

    console.log('\n=== Coach manages plans ===')
    {
      const coachPlanBody = { level: 'SCALED', notes: 'Take it easy today' }
      const r = await req('PUT', `/workouts/${workoutId}/plans/${memberId}`, coachToken, coachPlanBody)
      check('Coach PUT plan for member → 200', 200, r.status)
      check('Coach PUT plan for member → level SCALED', 'SCALED', (r.body as any).level)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${memberId}`, coachToken)
      check('Coach GET plan for member → 200', 200, r.status)
      check('Coach GET plan for member → level SCALED', 'SCALED', (r.body as any).level)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans`, coachToken)
      check('Coach GET all plans → 200', 200, r.status)
      check('Coach GET all plans → array', true, Array.isArray(r.body))
      check('Coach GET all plans → at least 1', true, (r.body as any[]).length >= 1)
    }

    // ── Member updates their own plan ────────────────────────────────────────

    console.log('\n=== Member updates own plan ===')
    {
      const updated = { level: 'RX_PLUS', notes: 'Feeling strong' }
      const r = await req('PUT', `/workouts/${workoutId}/plans/${memberId}`, memberToken, updated)
      check('Member updates own plan → 200', 200, r.status)
      check('Member updates own plan → level RX_PLUS', 'RX_PLUS', (r.body as any).level)
    }

    // ── Delete plan ──────────────────────────────────────────────────────────

    console.log('\n=== Delete plan ===')
    {
      const r = await req('DELETE', `/workouts/${workoutId}/plans/${memberId}`, memberToken)
      check('Member deletes own plan → 204', 204, r.status)
    }
    {
      const r = await req('GET', `/workouts/${workoutId}/plans/${memberId}`, memberToken)
      check('Plan is gone after delete → 404', 404, r.status)
    }
    {
      const r = await req('DELETE', `/workouts/${workoutId}/plans/${memberId}`, memberToken)
      check('Delete nonexistent plan → 404', 404, r.status)
    }
  } finally {
    if (workoutId) await teardown()
    await prisma.$disconnect()
  }

  console.log(`\n=== plans: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
