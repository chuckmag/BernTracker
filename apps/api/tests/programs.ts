/**
 * Integration tests for program CRUD endpoints (Slice 1 of #82).
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/programs.ts
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
let gymId = ''
let otherGymId = ''
let ownerUserId = ''
let programmerUserId = ''
let memberUserId = ''
let coachUserId = ''
let outsiderUserId = ''
let ownerToken = ''
let programmerToken = ''
let memberToken = ''
let coachToken = ''
let outsiderToken = ''
const createdProgramIds: string[] = []

async function setup() {
  console.log('\n=== Setup ===')
  const [gym, otherGym] = await Promise.all([
    prisma.gym.create({ data: { name: `Programs AT ${TS}`, slug: `programs-at-${TS}`, timezone: 'UTC' } }),
    prisma.gym.create({ data: { name: `Other Gym ${TS}`, slug: `other-at-${TS}`, timezone: 'UTC' } }),
  ])
  gymId = gym.id
  otherGymId = otherGym.id

  const [owner, programmer, member, coach, outsider] = await Promise.all([
    prisma.user.create({ data: { email: `prog-owner-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `prog-progmr-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `prog-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `prog-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `prog-outside-${TS}@test.com` } }),
  ])
  ownerUserId = owner.id
  programmerUserId = programmer.id
  memberUserId = member.id
  coachUserId = coach.id
  outsiderUserId = outsider.id

  await prisma.userGym.createMany({
    data: [
      { userId: ownerUserId, gymId, role: 'OWNER' },
      { userId: programmerUserId, gymId, role: 'PROGRAMMER' },
      { userId: memberUserId, gymId, role: 'MEMBER' },
      { userId: coachUserId, gymId, role: 'COACH' },
      { userId: outsiderUserId, gymId: otherGymId, role: 'OWNER' },
    ],
  })

  ownerToken = signTokenPair(ownerUserId, 'OWNER').accessToken
  programmerToken = signTokenPair(programmerUserId, 'PROGRAMMER').accessToken
  memberToken = signTokenPair(memberUserId, 'MEMBER').accessToken
  coachToken = signTokenPair(coachUserId, 'COACH').accessToken
  outsiderToken = signTokenPair(outsiderUserId, 'OWNER').accessToken

  console.log(`  gym=${gymId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n=== POST /api/gyms/:gymId/programs ===')
  let createdId = ''

  {
    const r = await api('POST', `/gyms/${gymId}/programs`, programmerToken, {
      name: `AT Program ${TS}`,
      description: 'Integration test program',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      coverColor: '#6366F1',
    })
    check('POST as PROGRAMMER → 201', 201, r.status)
    const program = (r.body.program as { id: string; name: string; coverColor: string } | undefined) ?? { id: '', name: '', coverColor: '' }
    check('POST returns program.name', `AT Program ${TS}`, program.name)
    check('POST returns program.coverColor', '#6366F1', program.coverColor)
    createdId = program.id
    if (createdId) createdProgramIds.push(createdId)
  }

  {
    const r = await api('POST', `/gyms/${gymId}/programs`, memberToken, {
      name: 'Should fail',
      startDate: '2026-04-01',
    })
    check('POST as MEMBER → 403', 403, r.status)
  }

  {
    const r = await api('POST', `/gyms/${gymId}/programs`, undefined, {
      name: 'No auth', startDate: '2026-04-01',
    })
    check('POST without auth → 401', 401, r.status)
  }

  {
    const r = await api('POST', `/gyms/${gymId}/programs`, programmerToken, {
      description: 'missing name', startDate: '2026-04-01',
    })
    check('POST with missing name → 400', 400, r.status)
  }

  {
    const r = await api('POST', `/gyms/${gymId}/programs`, programmerToken, {
      name: 'Bad color', startDate: '2026-04-01', coverColor: 'blueish',
    })
    check('POST with invalid coverColor → 400', 400, r.status)
  }

  console.log('\n=== GET /api/gyms/:gymId/programs ===')

  {
    const r = await api('GET', `/gyms/${gymId}/programs`, memberToken)
    check('GET list as MEMBER → 200', 200, r.status)
    check('GET list returns array', true, Array.isArray(r.body))
  }

  {
    const r = await api('GET', `/gyms/${gymId}/programs`, outsiderToken)
    check('GET list as non-gym user → 403', 403, r.status)
  }

  console.log('\n=== GET /api/programs/:id ===')

  {
    const r = await api('GET', `/programs/${createdId}`, memberToken)
    check('GET detail as gym MEMBER → 200', 200, r.status)
    const detail = r.body as { program?: { id: string } }
    check('GET detail returns program.id', createdId, detail.program?.id)
  }

  {
    const r = await api('GET', `/programs/${createdId}`, coachToken)
    check('GET detail as COACH → 200', 200, r.status)
  }

  {
    const r = await api('GET', `/programs/${createdId}`, outsiderToken)
    check('GET detail as non-gym user → 403', 403, r.status)
  }

  {
    const r = await api('GET', `/programs/nonexistent-id-${TS}`, ownerToken)
    check('GET detail for unknown id → 404', 404, r.status)
  }

  console.log('\n=== PATCH /api/programs/:id ===')

  {
    const r = await api('PATCH', `/programs/${createdId}`, programmerToken, { name: 'Renamed AT' })
    check('PATCH as PROGRAMMER → 200', 200, r.status)
    check('PATCH updates name', 'Renamed AT', r.body.name)
  }

  {
    const r = await api('PATCH', `/programs/${createdId}`, coachToken, { name: 'Coach rename' })
    check('PATCH as COACH (write access) → 200', 200, r.status)
  }

  {
    const r = await api('PATCH', `/programs/${createdId}`, memberToken, { name: 'Member rename' })
    check('PATCH as MEMBER → 403', 403, r.status)
  }

  {
    const r = await api('PATCH', `/programs/${createdId}`, programmerToken, { name: '' })
    check('PATCH with empty name → 400', 400, r.status)
  }

  {
    const r = await api('PATCH', `/programs/${createdId}`, programmerToken, {})
    check('PATCH with empty body → 400', 400, r.status)
  }

  console.log('\n=== DELETE /api/programs/:id ===')

  {
    const r = await api('DELETE', `/programs/${createdId}`, programmerToken)
    check('DELETE as PROGRAMMER → 403 (OWNER only)', 403, r.status)
  }

  {
    const r = await api('DELETE', `/programs/${createdId}`, memberToken)
    check('DELETE as MEMBER → 403', 403, r.status)
  }

  {
    // Verify that deleting a program with assigned workouts nulls the workouts' programId
    const workout = await prisma.workout.create({
      data: {
        programId: createdId,
        title: 'Linked workout',
        description: 'linked',
        type: 'AMRAP',
        scheduledAt: new Date('2026-04-15T12:00:00Z'),
      },
    })

    const r = await api('DELETE', `/programs/${createdId}`, ownerToken)
    check('DELETE as OWNER → 204', 204, r.status)
    createdProgramIds.splice(createdProgramIds.indexOf(createdId), 1)

    const remaining = await prisma.workout.findUnique({ where: { id: workout.id }, select: { programId: true } })
    check('Workout.programId is nulled after program delete', null, remaining?.programId ?? null)
    await prisma.workout.delete({ where: { id: workout.id } })
  }

  {
    const r = await api('GET', `/programs/${createdId}`, ownerToken)
    check('GET deleted program → 404', 404, r.status)
  }

  // ── GET /api/gyms/:gymId/workouts?programIds=… (slice 2) ───────────────────
  console.log('\n=== GET /api/gyms/:gymId/workouts?programIds=… (multi-program filter) ===')

  // Three fresh programs: A1 + A2 linked to `gymId` (caller's gym), B linked to
  // `otherGymId` only. One workout per program, all in the test date range.
  const programA1 = await prisma.program.create({
    data: { name: `Filter A1 ${TS}`, startDate: new Date('2026-05-01'), gyms: { create: { gymId } } },
  })
  const programA2 = await prisma.program.create({
    data: { name: `Filter A2 ${TS}`, startDate: new Date('2026-05-01'), gyms: { create: { gymId } } },
  })
  const programB = await prisma.program.create({
    data: { name: `Filter B ${TS}`, startDate: new Date('2026-05-01'), gyms: { create: { gymId: otherGymId } } },
  })
  createdProgramIds.push(programA1.id, programA2.id, programB.id)

  const a1Workout = await prisma.workout.create({
    data: {
      programId: programA1.id, title: 'A1 workout', description: 'a1', type: 'AMRAP',
      scheduledAt: new Date('2026-05-10T12:00:00Z'), status: 'PUBLISHED',
    },
  })
  const a2Workout = await prisma.workout.create({
    data: {
      programId: programA2.id, title: 'A2 workout', description: 'a2', type: 'AMRAP',
      scheduledAt: new Date('2026-05-10T12:00:00Z'), status: 'PUBLISHED',
    },
  })
  const bWorkout = await prisma.workout.create({
    data: {
      programId: programB.id, title: 'B workout', description: 'b', type: 'AMRAP',
      scheduledAt: new Date('2026-05-10T12:00:00Z'), status: 'PUBLISHED',
    },
  })

  const range = 'from=2026-05-01&to=2026-05-31T23:59:59Z'

  {
    // Regression — no programIds → existing behavior. Caller is gymId-scoped, so
    // they only see workouts whose program is linked to gymId (A1 + A2).
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}`, programmerToken)
    check('GET no filter → 200', 200, r.status)
    const titles = (r.body as unknown as { title: string }[]).map((w) => w.title)
    check('GET no filter includes A1', true, titles.includes('A1 workout'))
    check('GET no filter includes A2', true, titles.includes('A2 workout'))
    check('GET no filter excludes B (other gym)', false, titles.includes('B workout'))
  }

  {
    // Single program in the CSV
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programA1.id}`, programmerToken)
    check('GET ?programIds=A1 as PROGRAMMER → 200', 200, r.status)
    const titles = (r.body as unknown as { title: string }[]).map((w) => w.title).sort()
    check('GET ?programIds=A1 returns only A1', JSON.stringify(['A1 workout']), JSON.stringify(titles))
  }

  {
    // Multi-program CSV — both A1 and A2 are accessible
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programA1.id},${programA2.id}`, programmerToken)
    check('GET ?programIds=A1,A2 → 200', 200, r.status)
    const titles = (r.body as unknown as { title: string }[]).map((w) => w.title).sort()
    check('GET ?programIds=A1,A2 returns both', JSON.stringify(['A1 workout', 'A2 workout']), JSON.stringify(titles))
  }

  {
    // MEMBER role sees published workouts only — both A1 and A2 are PUBLISHED
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programA1.id},${programA2.id}`, memberToken)
    check('GET ?programIds=A1,A2 as MEMBER → 200', 200, r.status)
    const arr = r.body as unknown as { title: string }[]
    check('GET ?programIds=A1,A2 as MEMBER → 2 results', 2, arr.length)
  }

  {
    // Mix of accessible (A1) and inaccessible (B) — should 403 on first failure
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programA1.id},${programB.id}`, programmerToken)
    check('GET ?programIds=A1,B (B unlinked) → 403', 403, r.status)
  }

  {
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programB.id}`, programmerToken)
    check('GET ?programIds=B (unlinked) → 403', 403, r.status)
  }

  {
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=does-not-exist-${TS}`, programmerToken)
    check('GET ?programIds=<missing> → 404', 404, r.status)
  }

  {
    // CSV with empty entries (e.g. trailing comma) → treated as no filter
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=`, programmerToken)
    check('GET ?programIds= (empty) → 200', 200, r.status)
  }

  {
    // No auth → 401 from requireAuth, before our filter check runs
    const r = await api('GET', `/gyms/${gymId}/workouts?${range}&programIds=${programA1.id}`)
    check('GET ?programIds without auth → 401', 401, r.status)
  }

  // Cleanup the new fixtures here so teardown doesn't have to know about them
  await prisma.workout.delete({ where: { id: a1Workout.id } })
  await prisma.workout.delete({ where: { id: a2Workout.id } })
  await prisma.workout.delete({ where: { id: bWorkout.id } })

  // ── /api/programs/:id/members + /api/me/programs (slice 3) ──────────────────
  console.log('\n=== /api/programs/:id/members + /api/me/programs (slice 3) ===')

  // Reuse `programA1` from the filter section as the membership program. Both
  // owner and programmer already belong to gymId; member already belongs as
  // MEMBER role; coach already belongs as COACH; outsider is in otherGymId.
  const memberProgramId = programA1.id

  {
    // GET members — empty
    const r = await api('GET', `/programs/${memberProgramId}/members`, programmerToken)
    check('GET members (empty) → 200', 200, r.status)
    check('GET members (empty) → []', '[]', JSON.stringify(r.body))
  }

  {
    // POST invite by userId — happy path (PROGRAMMER managing)
    const r = await api('POST', `/programs/${memberProgramId}/members`, programmerToken, {
      userId: memberUserId,
    })
    check('POST invite by userId → 201', 201, r.status)
    check('POST invite returns userId', memberUserId, r.body.userId)
    check('POST invite default role MEMBER', 'MEMBER', r.body.role)
  }

  {
    // POST invite same user again — duplicate
    const r = await api('POST', `/programs/${memberProgramId}/members`, programmerToken, {
      userId: memberUserId,
    })
    check('POST invite duplicate → 409', 409, r.status)
  }

  {
    // POST invite by email — happy path with role=PROGRAMMER
    const r = await api('POST', `/programs/${memberProgramId}/members`, programmerToken, {
      email: `prog-coach-${TS}@test.com`,
      role: 'PROGRAMMER',
    })
    check('POST invite by email → 201', 201, r.status)
    check('POST invite role=PROGRAMMER respected', 'PROGRAMMER', r.body.role)
  }

  {
    // POST invite by email of a non-gym user → 404
    const ghost = await prisma.user.create({ data: { email: `prog-ghost-${TS}@test.com` } })
    const r = await api('POST', `/programs/${memberProgramId}/members`, programmerToken, {
      email: `prog-ghost-${TS}@test.com`,
    })
    check('POST invite non-gym email → 404', 404, r.status)
    await prisma.user.delete({ where: { id: ghost.id } })
  }

  {
    // POST invite without userId or email → 400
    const r = await api('POST', `/programs/${memberProgramId}/members`, programmerToken, {})
    check('POST invite empty → 400', 400, r.status)
  }

  {
    // POST invite as COACH → 403 (read-only)
    const r = await api('POST', `/programs/${memberProgramId}/members`, coachToken, {
      userId: ownerUserId,
    })
    check('POST invite as COACH → 403', 403, r.status)
  }

  {
    // POST invite as MEMBER → 403
    const r = await api('POST', `/programs/${memberProgramId}/members`, memberToken, {
      userId: ownerUserId,
    })
    check('POST invite as MEMBER → 403', 403, r.status)
  }

  {
    // GET members as COACH — read-only access permitted
    const r = await api('GET', `/programs/${memberProgramId}/members`, coachToken)
    check('GET members as COACH → 200', 200, r.status)
    check('GET members count after invites', 2, (r.body as unknown as unknown[]).length)
  }

  {
    // GET members as MEMBER → 403 (write access required)
    const r = await api('GET', `/programs/${memberProgramId}/members`, memberToken)
    check('GET members as MEMBER → 403', 403, r.status)
  }

  {
    // DELETE member as COACH → 403
    const r = await api('DELETE', `/programs/${memberProgramId}/members/${memberUserId}`, coachToken)
    check('DELETE member as COACH → 403', 403, r.status)
  }

  {
    // DELETE member as PROGRAMMER → 204
    const r = await api('DELETE', `/programs/${memberProgramId}/members/${memberUserId}`, programmerToken)
    check('DELETE member as PROGRAMMER → 204', 204, r.status)
  }

  {
    // DELETE same member again → 404 (already gone)
    const r = await api('DELETE', `/programs/${memberProgramId}/members/${memberUserId}`, programmerToken)
    check('DELETE member already gone → 404', 404, r.status)
  }

  // ── /api/me/programs?gymId ───────────────────────────────────────────────────
  console.log('\n=== GET /api/me/programs?gymId=… ===')

  {
    const r = await api('GET', `/me/programs?gymId=${gymId}`, ownerToken)
    check('me/programs as OWNER → 200', 200, r.status)
    // Staff sees all programs in the gym (slice-1 program + filter A1/A2)
    const ids = (r.body as unknown as { programId: string }[]).map((g) => g.programId).sort()
    check('me/programs as OWNER includes A1', true, ids.includes(programA1.id))
    check('me/programs as OWNER includes A2', true, ids.includes(programA2.id))
  }

  {
    // member user is currently subscribed to memberProgramId via the role=PROGRAMMER
    // invite-by-email above? No — that was the coach. memberUserId was deleted from
    // the program just above. So member should see 0 program subscriptions.
    const r = await api('GET', `/me/programs?gymId=${gymId}`, memberToken)
    check('me/programs as MEMBER (no subs) → 200', 200, r.status)
    check('me/programs as MEMBER (no subs) → []', '[]', JSON.stringify(r.body))
  }

  {
    // Subscribe member to A2 directly via Prisma; me/programs should now return [A2].
    await prisma.userProgram.create({ data: { userId: memberUserId, programId: programA2.id, role: 'MEMBER' } })
    const r = await api('GET', `/me/programs?gymId=${gymId}`, memberToken)
    check('me/programs as MEMBER (1 sub) → 200', 200, r.status)
    const arr = r.body as unknown as { programId: string }[]
    check('me/programs as MEMBER → 1 result', 1, arr.length)
    check('me/programs as MEMBER returns the right program', programA2.id, arr[0]?.programId)
    await prisma.userProgram.delete({ where: { userId_programId: { userId: memberUserId, programId: programA2.id } } })
  }

  {
    // Outsider (in otherGymId only) hitting gymId → 403
    const r = await api('GET', `/me/programs?gymId=${gymId}`, outsiderToken)
    check('me/programs for non-member → 403', 403, r.status)
  }

  {
    const r = await api('GET', `/me/programs`, ownerToken)
    check('me/programs without gymId → 400', 400, r.status)
  }

  {
    const r = await api('GET', `/me/programs?gymId=${gymId}`)
    check('me/programs without auth → 401', 401, r.status)
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  // Best-effort cleanup — each deletion is idempotent
  for (const pid of createdProgramIds) {
    await prisma.workout.deleteMany({ where: { programId: pid } }).catch(() => {})
    await prisma.program.delete({ where: { id: pid } }).catch(() => {})
  }
  await prisma.user.deleteMany({
    where: { id: { in: [ownerUserId, programmerUserId, memberUserId, coachUserId, outsiderUserId] } },
  }).catch(() => {})
  await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: otherGymId } }).catch(() => {})
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
