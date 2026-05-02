/**
 * Integration tests for the seed-crossfit-movements job.
 *
 * Runs the job directly against the dev DB, then asserts the catalog is
 * populated and that re-running the job leaves rows unchanged (idempotency).
 *
 * Requires: DB accessible via DATABASE_URL. Does NOT require the API server
 * to be running — the job interacts with Prisma directly.
 *
 * Run: cd apps/api && npx tsx tests/seed-crossfit-movements.ts
 */

import { prisma } from '@wodalytics/db'
import {
  CROSSFIT_MOVEMENT_CATALOG,
  runSeedCrossfitMovementsJob,
} from '../src/jobs/seedCrossfitMovements.js'

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

async function runTests() {
  console.log('\n=== seed-crossfit-movements: catalog basics ===')

  check('catalog is non-empty', true, CROSSFIT_MOVEMENT_CATALOG.length > 0)
  check('catalog has at least 90 entries', true, CROSSFIT_MOVEMENT_CATALOG.length >= 90)
  // Every name should be free of the "The " prefix.
  const stillHasThe = CROSSFIT_MOVEMENT_CATALOG.filter((m) => /^the\s/i.test(m.name))
  check('no name starts with "The "', 0, stillHasThe.length)
  // Every entry should carry a CrossFit URL.
  const missingUrl = CROSSFIT_MOVEMENT_CATALOG.filter((m) => !m.sourceUrl.startsWith('https://www.crossfit.com/'))
  check('every entry carries a crossfit.com sourceUrl', 0, missingUrl.length)

  console.log('\n=== first run upserts the catalog ===')

  // Capture pre-existing names so we can scope our assertions to seeded rows.
  const seedNames = CROSSFIT_MOVEMENT_CATALOG.map((m) => m.name)

  const summary = await runSeedCrossfitMovementsJob()
  check('summary.total matches catalog length', CROSSFIT_MOVEMENT_CATALOG.length, summary.total)
  check('first run touched every row (created + updated + unchanged sums to total)',
    summary.total,
    summary.created + summary.updated + summary.unchanged)

  // Spot-check: the seeded movements exist with the expected URL + aliases.
  const thruster = await prisma.movement.findUnique({
    where: { name: 'Thruster' },
    select: { sourceUrl: true, aliases: true, status: true },
  })
  check('Thruster persisted', true, thruster !== null)
  check('Thruster sourceUrl', 'https://www.crossfit.com/essentials/the-thruster', thruster?.sourceUrl)
  check('Thruster status=ACTIVE', 'ACTIVE', thruster?.status)

  const wallball = await prisma.movement.findUnique({
    where: { name: 'Wall-ball Shot' },
    select: { aliases: true },
  })
  check('Wall-ball Shot aliases include WB', true, (wallball?.aliases ?? []).includes('WB'))
  check('Wall-ball Shot aliases include "Wall Ball"', true, (wallball?.aliases ?? []).includes('Wall Ball'))

  const t2b = await prisma.movement.findUnique({
    where: { name: 'Kipping Toes-to-bar' },
    select: { aliases: true },
  })
  check('Kipping Toes-to-bar alias T2B', true, (t2b?.aliases ?? []).includes('T2B'))

  const pistol = await prisma.movement.findUnique({
    where: { name: 'Single-leg Squat (Pistol)' },
    select: { aliases: true },
  })
  check('Single-leg Squat (Pistol) alias "pistol"', true, (pistol?.aliases ?? []).includes('pistol'))

  console.log('\n=== second run is idempotent ===')

  const secondRun = await runSeedCrossfitMovementsJob()
  check('second run total matches', CROSSFIT_MOVEMENT_CATALOG.length, secondRun.total)
  check('second run creates 0 rows', 0, secondRun.created)
  check('second run updates 0 rows', 0, secondRun.updated)
  check('second run leaves all rows unchanged', CROSSFIT_MOVEMENT_CATALOG.length, secondRun.unchanged)

  console.log('\n=== fuzzy match picks up an alias ===')

  // Confirm the detect path resolves a short alias to the canonical movement.
  // Done via direct Prisma + Fuse import would duplicate the runtime logic;
  // simpler to drive it through detectMovementsInText so we exercise the
  // exact production path.
  const { detectMovementsInText } = await import('../src/db/movementDbManager.js')
  const matches = await detectMovementsInText('AMRAP 10: 15 WB Shots, 200m run, 10 KBS')
  const matchNames = matches.map((m) => m.name)
  check('alias "WB" resolves to Wall-ball Shot', true, matchNames.includes('Wall-ball Shot'))
  check('alias "KBS" resolves to Kettlebell Swing', true, matchNames.includes('Kettlebell Swing'))

  // Sanity scope: every catalog name we asserted by ID is indeed in the DB.
  const dbCount = await prisma.movement.count({ where: { name: { in: seedNames } } })
  check('all catalog names are present in the DB', CROSSFIT_MOVEMENT_CATALOG.length, dbCount)
}

async function main() {
  try {
    await runTests()
  } catch (err) {
    console.error('Test run threw:', err)
    fail++
  } finally {
    await prisma.$disconnect()
  }
  console.log(`\n=== seed-crossfit-movements: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
