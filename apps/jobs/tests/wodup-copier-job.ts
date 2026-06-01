/**
 * Integration test for runWodupCopierJob — exercises the real DB but stubs
 * the upstream WODup HTTP client.
 *
 * Requires: DB accessible via DATABASE_URL, WODUP_SESSION_TOKEN set to any
 * non-empty string (the stub never validates it).
 * Run as part of `npm test` from apps/jobs (or directly via tsx).
 */

import { prisma } from '@wodalytics/db'
import { runWodupCopierJob, currentWeekRange } from '../src/wodupCopier.js'
import type { WodUpWod } from '../src/lib/wodupClient.js'

const PROGRAM_NAME = 'CrossFit Override'
const TS = Date.now()
const SENTINEL = `it-${TS}`

// Ensure the job can find a session token — value doesn't matter (stub never hits wodup.com).
process.env.WODUP_SESSION_TOKEN = `test-token-${SENTINEL}`

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

// Builds a WodUpWod fixture — single main component (prefix:A) by default.
// The description lives in details.description (Generic type pattern) so the
// copier's componentBody() helper is exercised.
function makeWod(overrides: Partial<WodUpWod> = {}): WodUpWod {
  return {
    id: `wod-${SENTINEL}`,
    name: `Test WOD ${SENTINEL}`,
    occursOn: '2026-06-02',
    publishAt: null,
    wodComponents: [
      {
        id: `comp-${SENTINEL}`,
        prefix: 'A',
        workout: {
          id: `inner-${SENTINEL}`,
          type: 'Generic',
          name: null,
          description: 'METCON',
          details: {
            description: 'For time:\n21-15-9\nThrusters (95/65 lb)\nPull-ups',
            name: 'METCON',
            type: 'Generic',
          },
        },
      },
    ],
    ...overrides,
  }
}

// Wraps a WodUpWod[] in the GymPublishedWods GraphQL response envelope.
function makeWodupResponse(wods: WodUpWod[]): Response {
  const body = {
    data: {
      currentUser: {
        themeGym: {
          id: '992',
          name: 'CrossFit Override',
          publishedWods: wods,
        },
      },
    },
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

let programId = ''
let createdElsewhere = false

async function setup() {
  console.log('\n=== Setup ===')
  const existing = await prisma.program.findFirst({ where: { name: PROGRAM_NAME } })
  if (existing) {
    programId = existing.id
    createdElsewhere = true
    console.log(`  reusing existing program ${programId}`)
  } else {
    const program = await prisma.program.create({
      data: { name: PROGRAM_NAME, startDate: new Date('2026-01-01') },
    })
    programId = program.id
    console.log(`  created program ${programId}`)
  }
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  if (!createdElsewhere) {
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  }
  console.log('  cleaned up')
}

async function runHappyPathScenario() {
  console.log('\n=== runWodupCopierJob — happy path: creates a Workout ===')
  const wod = makeWod()
  await runWodupCopierJob({
    fetchImpl: async () => makeWodupResponse([wod]),
  })

  const externalSourceId = `wodup:${wod.id}`
  const w = await prisma.workout.findUnique({ where: { externalSourceId } })
  check('workout created', true, w !== null)
  check('externalSourceId correct', externalSourceId, w?.externalSourceId)
  check('linked to program', programId, w?.programId)
  check('title is wod name', wod.name!, w?.title)
  // description comes from details.description (Generic type), not workout.description
  const expectedDesc = (wod.wodComponents[0]!.workout.details as Record<string, unknown>)['description']
  check('description from details.description', expectedDesc, w?.description)
  check('type classified as FOR_TIME', 'FOR_TIME', w?.type)
  check('status published', 'PUBLISHED', w?.status)
  check('scheduledAt date correct', '2026-06-02', w?.scheduledAt.toISOString().slice(0, 10))
}

async function runIdempotencyScenario() {
  console.log('\n=== runWodupCopierJob — idempotency: re-run is a no-op ===')
  const wod = makeWod()
  const before = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  await runWodupCopierJob({ fetchImpl: async () => makeWodupResponse([wod]) })
  const after = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  check('no second workout created', before, after)
}

async function runMultiComponentScenario() {
  console.log('\n=== runWodupCopierJob — multi-component WOD: merged description ===')
  const wod = makeWod({
    id: `wod-multi-${SENTINEL}`,
    name: `Multi ${SENTINEL}`,
    occursOn: '2026-06-03',
    wodComponents: [
      // WarmUp (prefix:null) — should be skipped
      {
        id: `comp-warm-${SENTINEL}`,
        prefix: null,
        workout: {
          id: `inner-warm-${SENTINEL}`,
          type: 'WarmUp',
          name: null,
          description: 'Warm Up',
          details: { description: '10 min easy row', name: 'Warm Up', type: 'WarmUp' },
        },
      },
      // Strength component (description is the prescription; details has no description)
      {
        id: `comp-a-${SENTINEL}`,
        prefix: 'A',
        workout: {
          id: `inner-a-${SENTINEL}`,
          type: 'Strength',
          name: 'Back Squat',
          description: '5x5 Back Squat',
          details: { movements: [], type: 'Strength' },
        },
      },
      // Generic component (full text in details.description)
      {
        id: `comp-b-${SENTINEL}`,
        prefix: 'B',
        workout: {
          id: `inner-b-${SENTINEL}`,
          type: 'Generic',
          name: null,
          description: 'METCON',
          details: {
            description: 'AMRAP 10:\n10 Box Jumps\n10 Kettlebell Swings',
            name: 'METCON',
            type: 'Generic',
          },
        },
      },
    ],
  })

  await runWodupCopierJob({ fetchImpl: async () => makeWodupResponse([wod]) })

  const externalSourceId = `wodup:${wod.id}`
  const w = await prisma.workout.findUnique({ where: { externalSourceId } })
  check('multi-component workout created', true, w !== null)
  check('title is wod name', `Multi ${SENTINEL}`, w?.title)
  check(
    'description contains A: Back Squat (Strength — from workout.description)',
    true,
    w?.description.includes('A: Back Squat'),
  )
  check(
    'description contains B: METCON (Generic — from details.description)',
    true,
    w?.description.includes('B: METCON') && w?.description.includes('AMRAP 10:'),
  )
  check('warmup component excluded from description', false, w?.description.includes('easy row'))
  check('AMRAP text in B drives type classification', 'AMRAP', w?.type)
}

async function runWarmupOnlyScenario() {
  console.log('\n=== runWodupCopierJob — warmup-only WOD: skipped with no workout created ===')
  const warmupWod = makeWod({
    id: `wod-warmup-${SENTINEL}`,
    occursOn: '2026-06-05',
    wodComponents: [
      {
        id: `comp-warm-only-${SENTINEL}`,
        prefix: null,
        workout: {
          id: `inner-warm-only-${SENTINEL}`,
          type: 'WarmUp',
          name: null,
          description: 'Hero Challenge Mobility',
          details: { description: '10 min mobility flow', name: 'Hero Challenge', type: 'WarmUp' },
        },
      },
    ],
  })
  const before = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  await runWodupCopierJob({ fetchImpl: async () => makeWodupResponse([warmupWod]) })
  const after = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  check('warmup-only WOD produces no workout', before, after)
}

async function runEmptyResponseScenario() {
  console.log('\n=== runWodupCopierJob — empty response: no-op, no throw ===')
  const before = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  let threw = false
  try {
    await runWodupCopierJob({ fetchImpl: async () => makeWodupResponse([]) })
  } catch {
    threw = true
  }
  const after = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  check('does not throw on empty response', false, threw)
  check('no workout created on empty response', before, after)
}

async function runUpstreamErrorScenario() {
  console.log('\n=== runWodupCopierJob — upstream 5xx: soft-fail, no throw ===')
  const before = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  let threw = false
  try {
    await runWodupCopierJob({
      fetchImpl: async () => new Response('Internal Server Error', { status: 500 }),
    })
  } catch {
    threw = true
  }
  const after = await prisma.workout.count({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  check('does not throw on 5xx upstream', false, threw)
  check('no workout created on upstream error', before, after)
}

async function runFetcherThrowsScenario() {
  console.log('\n=== runWodupCopierJob — fetcher throws: exception propagates ===')
  // fetchWodUpWeek catches network errors and returns [] (soft-fail).
  // A throw from fetchImpl itself is caught and returns [].
  let threw = false
  try {
    await runWodupCopierJob({
      fetchImpl: async () => {
        throw new Error('network failure')
      },
    })
  } catch {
    threw = true
  }
  check('network error in fetchImpl is soft-failed (no throw)', false, threw)
}

async function runMissingTokenScenario() {
  console.log('\n=== runWodupCopierJob — missing token: throws ===')
  const saved = process.env.WODUP_SESSION_TOKEN
  delete process.env.WODUP_SESSION_TOKEN
  let caught: unknown = null
  try {
    await runWodupCopierJob()
  } catch (err) {
    caught = err
  } finally {
    process.env.WODUP_SESSION_TOKEN = saved
  }
  check('throws when token missing', true, caught instanceof Error)
  check('error message mentions WODUP_SESSION_TOKEN', true, (caught as Error)?.message.includes('WODUP_SESSION_TOKEN'))
}

async function runWeekRangeScenario() {
  console.log('\n=== currentWeekRange — returns correct Monday and Sunday ===')
  // Wednesday 2026-06-03
  const wednesday = new Date('2026-06-03T10:00:00Z')
  const { startDate, endDate } = currentWeekRange(wednesday)
  check('Monday', '2026-06-01', startDate.toISOString().slice(0, 10))
  check('Sunday', '2026-06-07', endDate.toISOString().slice(0, 10))

  // Sunday 2026-06-07 — day-of-week = 0
  const sunday = new Date('2026-06-07T10:00:00Z')
  const { startDate: mon2, endDate: sun2 } = currentWeekRange(sunday)
  check('Monday (from Sunday)', '2026-06-01', mon2.toISOString().slice(0, 10))
  check('Sunday (from Sunday)', '2026-06-07', sun2.toISOString().slice(0, 10))

  // Monday 2026-06-01 — daysFromMonday = 0
  const monday = new Date('2026-06-01T10:00:00Z')
  const { startDate: mon3, endDate: sun3 } = currentWeekRange(monday)
  check('Monday (from Monday)', '2026-06-01', mon3.toISOString().slice(0, 10))
  check('Sunday (from Monday)', '2026-06-07', sun3.toISOString().slice(0, 10))
}

async function runMissingProgramScenario() {
  console.log('\n=== runWodupCopierJob — program missing: auto-creates program ===')
  if (createdElsewhere) {
    console.log('  (skipping — program existed before test run)')
    return
  }
  const renamedTo = `__hidden_${SENTINEL}__`
  await prisma.program.update({ where: { id: programId }, data: { name: renamedTo } })
  let createdProgramId: string | null = null
  let createdWorkoutId: string | null = null
  try {
    const wod = makeWod({
      id: `wod-bootstrap-${SENTINEL}`,
      name: `Bootstrap WOD ${SENTINEL}`,
      occursOn: '2026-06-04',
    })
    let threw = false
    try {
      await runWodupCopierJob({ fetchImpl: async () => makeWodupResponse([wod]) })
    } catch {
      threw = true
    }
    check('program-missing case does not throw', false, threw)

    const newProgram = await prisma.program.findFirst({ where: { name: PROGRAM_NAME } })
    check('job auto-created program', true, newProgram !== null)
    createdProgramId = newProgram?.id ?? null

    const w = await prisma.workout.findUnique({
      where: { externalSourceId: `wodup:${wod.id}` },
    })
    check('workout created against new program', true, w !== null)
    check('workout linked to auto-created program', createdProgramId, w?.programId)
    createdWorkoutId = w?.id ?? null
  } finally {
    if (createdWorkoutId) {
      await prisma.workout.delete({ where: { id: createdWorkoutId } }).catch(() => {})
    }
    if (createdProgramId && createdProgramId !== programId) {
      await prisma.program.delete({ where: { id: createdProgramId } }).catch(() => {})
    }
    await prisma.program.update({ where: { id: programId }, data: { name: PROGRAM_NAME } })
  }
}

async function main() {
  try {
    await setup()
    await runWeekRangeScenario()
    await runHappyPathScenario()
    await runIdempotencyScenario()
    await runMultiComponentScenario()
    await runWarmupOnlyScenario()
    await runEmptyResponseScenario()
    await runUpstreamErrorScenario()
    await runFetcherThrowsScenario()
    await runMissingTokenScenario()
    await runMissingProgramScenario()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('test runner crashed:', err)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
