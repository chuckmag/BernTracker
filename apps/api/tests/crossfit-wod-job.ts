/**
 * Integration test for runCrossfitWodJob — exercises the real DB but stubs
 * the upstream HTTP fetcher.
 *
 * Requires: DB accessible via DATABASE_URL.
 * Run as part of `npm test` from apps/api (or directly via tsx).
 */

import { prisma } from '@berntracker/db'
import { runCrossfitWodJob } from '../src/jobs/crossfitWod.js'
import type { NormalizedCrossfitWod } from '../src/lib/crossfitWodClient.js'

const PROGRAM_NAME = 'CrossFit Mainsite WOD'
const TS = Date.now()
// Sentinel string baked into both the externalSourceId and the workout title
// so this run's rows are easy to clean up even if a previous run died mid-test.
const SENTINEL = `it-${TS}`

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

function fixture(overrides: Partial<NormalizedCrossfitWod> = {}): NormalizedCrossfitWod {
  return {
    externalId: `w${SENTINEL}`,
    title: `Test WOD ${SENTINEL}`,
    descriptionRaw: 'For time:\n400-meter run\n50 burpees',
    descriptionHtml: '<p>For time:<br />...</p>',
    scheduledAt: '2026-04-25T15:00:00+00:00',
    canonicalUrl: '/test',
    previousUrl: null,
    ...overrides,
  }
}

let programId = ''
let createdElsewhere = false

async function setup() {
  console.log('\n=== Setup ===')
  // Reuse the public program if it already exists (e.g. seeded by PR0); else
  // create it for the duration of the test and tear it down at the end.
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
  // Only delete workouts created by this test run (matched by sentinel in
  // externalSourceId), so rows from other tests / real ingest stay put.
  await prisma.workout.deleteMany({
    where: { externalSourceId: { contains: SENTINEL } },
  })
  if (!createdElsewhere) {
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
  }
  console.log('  cleaned up')
}

async function runFirstRunBackfillScenario() {
  console.log('\n=== runCrossfitWodJob — first run on empty program backfills 6 prior days + today ===')
  // Program is empty out of setup() unless something else has been writing to
  // it. Clear any sentinel rows from previous test runs so count starts at 0.
  await prisma.workout.deleteMany({
    where: { programId, externalSourceId: { contains: SENTINEL } },
  })
  const startCount = await prisma.workout.count({ where: { programId } })
  // If the program already has unrelated workouts (e.g. real data from a
  // local backfill), skip — the auto-backfill gate is "count == 0" and we
  // can't safely delete non-test rows.
  if (startCount > 0) {
    console.log(`  (skipping — program is non-empty: ${startCount} workouts)`)
    return
  }

  let calls = 0
  await runCrossfitWodJob({
    fetchWod: async (date) => {
      calls++
      const iso = date.toISOString().slice(0, 10)
      return fixture({
        externalId: `w${SENTINEL}-bf-${iso}`,
        title: `Test WOD bf ${iso}`,
      })
    },
  })

  check('fetchWod called 7 times (6 backfill + 1 today)', 7, calls)
  const saved = await prisma.workout.count({
    where: { programId, externalSourceId: { contains: `${SENTINEL}-bf-` } },
  })
  check('7 workouts saved (1 per day)', 7, saved)
}

async function runTests() {
  console.log('\n=== runCrossfitWodJob — happy path: creates a Workout ===')
  {
    const payload = fixture()
    let calls = 0
    await runCrossfitWodJob({
      fetchWod: async () => {
        calls++
        return payload
      },
    })
    check('fetchWod called once', 1, calls)
    const expectedExternalSourceId = `crossfit-mainsite:${payload.externalId}`
    const w = await prisma.workout.findUnique({
      where: { externalSourceId: expectedExternalSourceId },
    })
    check('workout created', true, w !== null)
    check('workout has correct externalSourceId', expectedExternalSourceId, w?.externalSourceId)
    check('workout linked to program', programId, w?.programId)
    check('workout title preserved', payload.title, w?.title)
    check('workout description preserved', payload.descriptionRaw, w?.description)
    check('workout type classified as FOR_TIME', 'FOR_TIME', w?.type)
    check('workout published (not draft)', 'PUBLISHED', w?.status)
  }

  console.log('\n=== runCrossfitWodJob — second run with same payload is a no-op ===')
  {
    const payload = fixture()
    const before = await prisma.workout.count({
      where: { externalSourceId: { contains: SENTINEL } },
    })
    await runCrossfitWodJob({ fetchWod: async () => payload })
    const after = await prisma.workout.count({
      where: { externalSourceId: { contains: SENTINEL } },
    })
    check('no second workout created (idempotent)', before, after)
  }

  console.log('\n=== runCrossfitWodJob — null payload (e.g. CrossFit 5xx, draft) is a no-op ===')
  {
    const before = await prisma.workout.count({
      where: { externalSourceId: { contains: SENTINEL } },
    })
    let threw = false
    try {
      await runCrossfitWodJob({ fetchWod: async () => null })
    } catch {
      threw = true
    }
    check('does not throw on null payload', false, threw)
    const after = await prisma.workout.count({
      where: { externalSourceId: { contains: SENTINEL } },
    })
    check('no workout created on null payload', before, after)
  }

  console.log('\n=== runCrossfitWodJob — fetcher throws → exception propagates ===')
  {
    let caught: unknown = null
    try {
      await runCrossfitWodJob({
        fetchWod: async () => {
          throw new Error('upstream broken')
        },
      })
    } catch (err) {
      caught = err
    }
    check('exception from fetcher propagates to caller', true, caught instanceof Error)
    check('exception message preserved', 'upstream broken', (caught as Error)?.message)
  }

  console.log('\n=== runCrossfitWodJob — different externalId creates a separate workout ===')
  {
    const otherPayload = fixture({
      externalId: `w${SENTINEL}-other`,
      title: `Test WOD other ${SENTINEL}`,
      descriptionRaw: 'AMRAP 12:\n10 pull-ups\n20 push-ups',
    })
    await runCrossfitWodJob({ fetchWod: async () => otherPayload })
    const w = await prisma.workout.findUnique({
      where: { externalSourceId: `crossfit-mainsite:${otherPayload.externalId}` },
    })
    check('second workout created with different externalId', true, w !== null)
    check('AMRAP description classified as AMRAP', 'AMRAP', w?.type)
  }
}

async function runMissingProgramScenario() {
  console.log('\n=== runCrossfitWodJob — program not found → auto-creates program and proceeds ===')
  // Hide the existing program by renaming it so the name lookup misses. The
  // job should then create a fresh program with PROGRAM_NAME and write the
  // workout into it. Only safe because this test owns the program (setup()
  // skips this branch when an external program already existed).
  if (createdElsewhere) {
    console.log('  (skipping — program existed before test run)')
    return
  }
  const renamedTo = `__hidden_${SENTINEL}__`
  await prisma.program.update({ where: { id: programId }, data: { name: renamedTo } })
  let createdProgramId: string | null = null
  let createdWorkoutId: string | null = null
  try {
    const payload = fixture({
      externalId: `w${SENTINEL}-bootstrap`,
      title: `Test WOD bootstrap ${SENTINEL}`,
    })
    let threw = false
    try {
      await runCrossfitWodJob({ fetchWod: async () => payload })
    } catch {
      threw = true
    }
    check('program-missing case does not throw', false, threw)

    const newProgram = await prisma.program.findFirst({ where: { name: PROGRAM_NAME } })
    check('job created program with expected name', true, newProgram !== null)
    createdProgramId = newProgram?.id ?? null

    const w = await prisma.workout.findUnique({
      where: { externalSourceId: `crossfit-mainsite:${payload.externalId}` },
    })
    check('workout created against the new program', true, w !== null)
    check('workout linked to the auto-created program', createdProgramId, w?.programId)
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
    await runFirstRunBackfillScenario()
    await runTests()
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
