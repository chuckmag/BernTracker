/**
 * Integration tests for the dedupe-legacy-movements job.
 *
 * Seeds two legacy Movement rows (no sourceUrl) plus their canonical
 * counterparts, plus a workout that references one of the legacies, then
 * runs the job and asserts the legacy rows are gone, the WorkoutMovement
 * is repointed, and re-running is a no-op.
 *
 * Requires: DB accessible via DATABASE_URL. Does NOT require the API server.
 *
 * Run: cd apps/api && npx tsx tests/dedupe-legacy-movements.ts
 */

import { prisma } from '@wodalytics/db'
import {
  DEDUPE_MAP,
  runDedupeLegacyMovementsJob,
} from '../src/jobs/dedupeLegacyMovements.js'

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

const TS = Date.now()

// Use names with the TS suffix so this test never collides with whatever the
// catalog or other tests have written. We mirror the dedupe-map shape — one
// legacy + one canonical per pair — but isolate them in this run.
const LEGACY_NAMES = [`Legacy Pull-up ${TS}`, `Legacy Wall Ball ${TS}`]
const CANONICAL_NAMES = [`Canonical Strict Pull-up ${TS}`, `Canonical Wall-ball Shot ${TS}`]

let gymId = ''
let programId = ''
let workoutWithLegacyId = ''
let workoutWithBothId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `Dedupe Gym ${TS}`, slug: `dedupe-gym-${TS}`, timezone: 'UTC' },
  })
  gymId = gym.id
  const program = await prisma.program.create({
    data: { name: `Dedupe Program ${TS}`, startDate: new Date('2026-03-01'), gyms: { create: { gymId } } },
  })
  programId = program.id

  // Two legacy + two canonical rows.
  for (const name of LEGACY_NAMES) {
    await prisma.movement.create({ data: { name, status: 'ACTIVE' } })
  }
  for (const name of CANONICAL_NAMES) {
    await prisma.movement.create({
      data: { name, status: 'ACTIVE', sourceUrl: `https://example.test/${name.replace(/\s+/g, '-').toLowerCase()}` },
    })
  }

  const legacyPullup = await prisma.movement.findUnique({ where: { name: LEGACY_NAMES[0] }, select: { id: true } })
  const legacyWB = await prisma.movement.findUnique({ where: { name: LEGACY_NAMES[1] }, select: { id: true } })
  const canonicalWB = await prisma.movement.findUnique({ where: { name: CANONICAL_NAMES[1] }, select: { id: true } })

  // Workout 1: only references the legacy Pull-up. Repoint should rewrite
  // the WorkoutMovement.movementId.
  const wA = await prisma.workout.create({
    data: {
      programId, title: `Dedupe wA ${TS}`, description: 'pull-ups', type: 'STRENGTH',
      scheduledAt: new Date('2026-04-01T10:00:00Z'),
      workoutMovements: { create: [{ movementId: legacyPullup!.id }] },
    },
  })
  workoutWithLegacyId = wA.id

  // Workout 2: references BOTH the legacy Wall Ball and the canonical
  // Wall-ball Shot. Dedupe should delete the legacy WM (not repoint) so
  // the (workoutId, movementId) compound primary key isn't violated.
  const wB = await prisma.workout.create({
    data: {
      programId, title: `Dedupe wB ${TS}`, description: 'wall ball + shots', type: 'AMRAP',
      scheduledAt: new Date('2026-04-02T10:00:00Z'),
      workoutMovements: { create: [{ movementId: legacyWB!.id }, { movementId: canonicalWB!.id }] },
    },
  })
  workoutWithBothId = wB.id

  console.log(`  gym=${gymId} program=${programId}`)
}

async function runTests() {
  // Inject our scoped pairs into the dedupe map for this test run only —
  // we mutate the imported map for the duration of the test then restore
  // it. Avoids polluting the runtime catalog seen by other tests.
  const originalMap = { ...DEDUPE_MAP }
  for (const k of Object.keys(DEDUPE_MAP)) delete DEDUPE_MAP[k]
  DEDUPE_MAP[LEGACY_NAMES[0]] = CANONICAL_NAMES[0]
  DEDUPE_MAP[LEGACY_NAMES[1]] = CANONICAL_NAMES[1]

  try {
    console.log('\n=== first run merges legacies onto canonicals ===')
    const summary = await runDedupeLegacyMovementsJob()
    check('merged=2', 2, summary.merged)
    check('legacyMissing=0', 0, summary.legacyMissing)
    check('canonicalMissing=0', 0, summary.canonicalMissing)
    check('workoutMovementsRepointed=1', 1, summary.workoutMovementsRepointed)
    check('workoutMovementsDeleted=1 (workout B already had canonical)', 1, summary.workoutMovementsDeleted)

    // Legacy rows are gone.
    const legacyA = await prisma.movement.findUnique({ where: { name: LEGACY_NAMES[0] } })
    const legacyB = await prisma.movement.findUnique({ where: { name: LEGACY_NAMES[1] } })
    check(`legacy "${LEGACY_NAMES[0]}" deleted`, null, legacyA)
    check(`legacy "${LEGACY_NAMES[1]}" deleted`, null, legacyB)

    // Canonical rows still exist (untouched).
    const canonicalA = await prisma.movement.findUnique({ where: { name: CANONICAL_NAMES[0] }, select: { id: true } })
    const canonicalB = await prisma.movement.findUnique({ where: { name: CANONICAL_NAMES[1] }, select: { id: true } })
    check('canonical Strict Pull-up still present', true, canonicalA !== null)
    check('canonical Wall-ball Shot still present', true, canonicalB !== null)

    // Workout A: now references the canonical Pull-up via the rewritten WM.
    const wA = await prisma.workout.findUnique({
      where: { id: workoutWithLegacyId },
      include: { workoutMovements: { select: { movementId: true } } },
    })
    check('workout A has 1 workoutMovement', 1, wA?.workoutMovements.length)
    check('workout A points at canonical Pull-up', canonicalA?.id, wA?.workoutMovements[0]?.movementId)

    // Workout B: only the canonical Wall-ball remains; the legacy WM was deleted.
    const wB = await prisma.workout.findUnique({
      where: { id: workoutWithBothId },
      include: { workoutMovements: { select: { movementId: true } } },
    })
    check('workout B collapsed to 1 workoutMovement', 1, wB?.workoutMovements.length)
    check('workout B references canonical Wall-ball', canonicalB?.id, wB?.workoutMovements[0]?.movementId)

    console.log('\n=== second run is idempotent ===')
    const second = await runDedupeLegacyMovementsJob()
    check('merged=0', 0, second.merged)
    check('legacyMissing=2 (already cleaned)', 2, second.legacyMissing)
    check('canonicalMissing=0', 0, second.canonicalMissing)
    check('workoutMovementsRepointed=0', 0, second.workoutMovementsRepointed)
    check('workoutMovementsDeleted=0', 0, second.workoutMovementsDeleted)

    console.log('\n=== canonical missing is reported, not crashed ===')
    DEDUPE_MAP[`Bogus Legacy ${TS}`] = `Bogus Canonical ${TS}`
    // Seed a legacy with no canonical to match.
    await prisma.movement.create({ data: { name: `Bogus Legacy ${TS}`, status: 'ACTIVE' } })
    const third = await runDedupeLegacyMovementsJob()
    check('merged=0 when canonical missing', 0, third.merged)
    check('canonicalMissing=1', 1, third.canonicalMissing)
    // The legacy stays around — we don't delete an orphan with nowhere to point its WMs.
    const bogusLegacy = await prisma.movement.findUnique({ where: { name: `Bogus Legacy ${TS}`, } })
    check('bogus legacy still present (not deleted without a canonical)', true, bogusLegacy !== null)
  } finally {
    // Restore the dedupe map so other consumers in the same Node process
    // see the production set.
    for (const k of Object.keys(DEDUPE_MAP)) delete DEDUPE_MAP[k]
    Object.assign(DEDUPE_MAP, originalMap)
  }
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.workout.deleteMany({ where: { programId } })
  await prisma.program.deleteMany({ where: { id: programId } })
  await prisma.gymProgram.deleteMany({ where: { gymId } }).catch(() => {})
  await prisma.gym.deleteMany({ where: { id: gymId } })
  // Whatever movements survived the run.
  await prisma.movement.deleteMany({
    where: { name: { in: [...LEGACY_NAMES, ...CANONICAL_NAMES, `Bogus Legacy ${TS}`] } },
  })
}

async function main() {
  try {
    await setup()
    await runTests()
  } catch (err) {
    console.error('Test run threw:', err)
    fail++
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n=== dedupe-legacy-movements: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
