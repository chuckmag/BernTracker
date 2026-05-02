/**
 * One-shot job: dedupe legacy Movement rows that pre-date the
 * seed-crossfit-movements catalog.
 *
 * Background: an earlier seeder (`packages/db/prisma/seed-movements.ts`,
 * 35 bases + 45 variations) populated the Movement library with names that
 * differed slightly from CrossFit's official `/crossfit-movements` listing
 * — e.g. "Pull-up" / "Muscle-up" / "Toes-to-Bar" / "Wall Ball" / "Lunge".
 * After seed-crossfit-movements ran, both rows exist side by side: the old
 * generic with no `sourceUrl`, and the canonical entry with the real URL.
 *
 * What this job does (per entry in DEDUPE_MAP):
 *   1. Look up the legacy row by name.
 *   2. Look up the canonical row (also by name).
 *   3. Repoint every WorkoutMovement(movementId = legacyId) onto canonicalId.
 *      - If the same workout already references the canonical movement, the
 *        compound primary key (workoutId, movementId) prevents a second row
 *        — delete the legacy WorkoutMovement instead.
 *   4. Delete the legacy Movement. The Movement.parentId relation is set to
 *      `SetNull`, so any variations that pointed at the legacy parent get
 *      their parentId nulled (they're top-level CrossFit canonicals now).
 *
 * Idempotent: re-running on a clean catalog finds zero legacy rows and
 * exits with all-zeros counters.
 *
 * Run locally:  JOB_NAME=dedupe-legacy-movements npm run job --workspace=@wodalytics/api
 * Run in QA:    Railway one-shot service with JOB_NAME=dedupe-legacy-movements.
 *
 * Companion to seed-crossfit-movements — the catalog there already carries
 * each legacy name as an alias on its canonical, so this job's only job is
 * cleaning up the orphaned rows.
 */

import { prisma } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'

const log = createLogger('jobs.dedupe-legacy-movements')

// Legacy name → canonical name. Both sides referenced by `Movement.name`
// (which is `@unique`). User-confirmed mappings as of 2026-05-02.
export const DEDUPE_MAP: Record<string, string> = {
  // Pure punctuation / hyphenation differences
  'Clean & Jerk':              'Clean and Jerk',
  'Wall Ball':                 'Wall-ball Shot',
  'Double Under':              'Double-under',
  'Single Under':              'Single-under',
  'Burpee Box Jump Over':      'Burpee Box Jump-over',

  // Old generic name → CrossFit's specific canonical
  'Pull-up':                   'Strict Pull-up',
  'Muscle-up':                 'Kipping Muscle-up',
  'Ring Muscle-up':            'Kipping Muscle-up',
  'Handstand Push-up':         'Handstand Push-up Variations',
  'Rope Climb':                'Rope Climb (Basket)',
  'Lunge':                     'Walking Lunge',
  'Step-up':                   'Box Step-up',
  'Front Rack Lunge':          'Barbell Front-rack Lunge',
  'American Kettlebell Swing': 'Kettlebell Swing',
  'Strict Press':              'Shoulder Press',
  'Pistol':                    'Single-leg Squat (Pistol)',

  // CrossFit treats these as the same lift; the old "squat" qualifier was
  // CF's default unspecified variant.
  'Squat Snatch':              'Snatch',
  'Hang Squat Snatch':         'Hang Snatch',
  'Squat Clean':               'Clean',
  'Hang Squat Clean':          'Hang Clean',

  // Kipping is the unqualified default
  'Chest-to-Bar Pull-up':      'Kipping Chest-to-bar Pull-up',
  'Bar Muscle-up':             'Kipping Bar Muscle-up',
  'Toes-to-Bar':               'Kipping Toes-to-bar',
  'Knees-to-Elbow':            'Strict Knees-to-elbows',
  'Deficit Handstand Push-up': 'Kipping Deficit Handstand Push-up',
}

export interface DedupeSummary {
  /** Legacy rows found and successfully merged. */
  merged: number
  /** Legacy rows in DEDUPE_MAP that didn't exist in the DB (already cleaned up, or never seeded). */
  legacyMissing: number
  /** Canonical rows from DEDUPE_MAP that didn't exist (catalog drift — investigate). */
  canonicalMissing: number
  /** WorkoutMovement rows repointed onto the canonical movement. */
  workoutMovementsRepointed: number
  /** WorkoutMovement rows deleted because the canonical was already on the same workout. */
  workoutMovementsDeleted: number
}

export async function runDedupeLegacyMovementsJob(): Promise<DedupeSummary> {
  const summary: DedupeSummary = {
    merged: 0,
    legacyMissing: 0,
    canonicalMissing: 0,
    workoutMovementsRepointed: 0,
    workoutMovementsDeleted: 0,
  }

  for (const [legacyName, canonicalName] of Object.entries(DEDUPE_MAP)) {
    const legacy = await prisma.movement.findUnique({ where: { name: legacyName }, select: { id: true } })
    if (!legacy) {
      summary.legacyMissing++
      continue
    }

    const canonical = await prisma.movement.findUnique({ where: { name: canonicalName }, select: { id: true } })
    if (!canonical) {
      log.warning(`canonical "${canonicalName}" missing for legacy "${legacyName}" — skipping (run seed-crossfit-movements first)`)
      summary.canonicalMissing++
      continue
    }

    // All work for one (legacy, canonical) pair runs in a single transaction
    // so a partial failure can't leave half-repointed WorkoutMovement rows.
    await prisma.$transaction(async (tx) => {
      // Find WorkoutMovement rows on the legacy movement.
      const legacyWms = await tx.workoutMovement.findMany({
        where: { movementId: legacy.id },
        select: { workoutId: true },
      })

      for (const wm of legacyWms) {
        // If the canonical movement is already on this workout, deleting the
        // legacy row is the right move — preserves the canonical's
        // prescription, avoids the (workoutId, movementId) unique-constraint
        // collision an UPDATE would hit.
        const existing = await tx.workoutMovement.findUnique({
          where: { workoutId_movementId: { workoutId: wm.workoutId, movementId: canonical.id } },
          select: { workoutId: true },
        })
        if (existing) {
          await tx.workoutMovement.delete({
            where: { workoutId_movementId: { workoutId: wm.workoutId, movementId: legacy.id } },
          })
          summary.workoutMovementsDeleted++
        } else {
          await tx.workoutMovement.update({
            where: { workoutId_movementId: { workoutId: wm.workoutId, movementId: legacy.id } },
            data: { movementId: canonical.id },
          })
          summary.workoutMovementsRepointed++
        }
      }

      // Now delete the legacy Movement row. Any variations that pointed at it
      // via Movement.parentId get parentId=NULL via the schema's default
      // SetNull behavior on optional relations.
      await tx.movement.delete({ where: { id: legacy.id } })
    })

    summary.merged++
  }

  log.info(
    `dedupe complete — merged=${summary.merged} legacyMissing=${summary.legacyMissing} ` +
    `canonicalMissing=${summary.canonicalMissing} ` +
    `workoutMovementsRepointed=${summary.workoutMovementsRepointed} ` +
    `workoutMovementsDeleted=${summary.workoutMovementsDeleted}`,
  )
  return summary
}
