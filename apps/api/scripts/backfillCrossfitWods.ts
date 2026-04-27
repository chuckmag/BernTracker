/**
 * One-off local script: walks the last N days (Pacific) and upserts each
 * day's published CrossFit Mainsite WOD into the public "CrossFit Mainsite
 * WOD" program.
 *
 * Intended to be run once on a fresh local DB to populate historical data
 * for development. NOT registered in the cron dispatcher — the daily
 * `crossfit-wod` job handles ongoing ingest. The unique externalSourceId
 * constraint makes re-runs harmless if you do invoke this again.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx apps/api/scripts/backfillCrossfitWods.ts [days]
 *
 * `days` defaults to 7. Sequential per-day requests (polite to crossfit.com,
 * logs read top-to-bottom).
 */

import { prisma, WorkoutStatus } from '@wodalytics/db'
import { createLogger } from '../src/lib/logger.js'
import { fetchCrossfitWod } from '../src/lib/crossfitWodClient.js'
import { classifyWorkoutType } from '../src/lib/crossfitWodClassifier.js'
import { todayInPacific } from '../src/lib/pacificDate.js'
import {
  createProgramByName,
  findProgramByName,
} from '../src/db/programDbManager.js'
import {
  createWorkoutForProgram,
  findWorkoutByExternalSourceId,
} from '../src/db/workoutDbManager.js'

const log = createLogger('scripts.backfill-crossfit-wods')

const PROGRAM_NAME = 'CrossFit Mainsite WOD'
const EXTERNAL_SOURCE_PREFIX = 'crossfit-mainsite:'
const DEFAULT_DAYS = 7

async function main(): Promise<number> {
  const daysArg = process.argv[2]
  const days = daysArg ? Number(daysArg) : DEFAULT_DAYS
  if (!Number.isInteger(days) || days < 1) {
    log.error(`invalid days argument: ${daysArg} — must be a positive integer`)
    return 2
  }

  let program = await findProgramByName(PROGRAM_NAME)
  if (!program) {
    log.info(`program "${PROGRAM_NAME}" not found — creating it`)
    program = await createProgramByName(PROGRAM_NAME)
  }

  const today = todayInPacific()
  let saved = 0
  let skipped = 0
  let missing = 0

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset),
    )
    const iso = date.toISOString().slice(0, 10)

    const payload = await fetchCrossfitWod(date)
    if (!payload) {
      log.info(`${iso}: no published wod (drafted / missing / upstream error)`)
      missing++
      continue
    }

    const externalSourceId = `${EXTERNAL_SOURCE_PREFIX}${payload.externalId}`
    const existing = await findWorkoutByExternalSourceId(externalSourceId)
    if (existing) {
      log.info(`${iso}: ${externalSourceId} already saved — skip`)
      skipped++
      continue
    }

    const type = classifyWorkoutType(payload.descriptionRaw)
    await createWorkoutForProgram({
      programId: program.id,
      title: payload.title,
      description: payload.descriptionRaw,
      type,
      scheduledAt: new Date(payload.scheduledAt),
      status: WorkoutStatus.PUBLISHED,
      externalSourceId,
    })
    log.info(`${iso}: saved ${externalSourceId} (${type})`)
    saved++
  }

  log.info(`backfill complete: ${saved} saved, ${skipped} skipped, ${missing} missing`)
  return 0
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async (err) => {
    log.error(`backfill crashed: ${err instanceof Error ? err.message : err}`, err)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
