import { WorkoutStatus } from '@berntracker/db'
import { createLogger } from '../lib/logger.js'
import {
  fetchCrossfitWod,
  type NormalizedCrossfitWod,
} from '../lib/crossfitWodClient.js'
import { classifyWorkoutType } from '../lib/crossfitWodClassifier.js'
import { todayInPacific } from '../lib/pacificDate.js'
import { createProgramByName, findProgramByName } from '../db/programDbManager.js'
import {
  createWorkoutForProgram,
  findWorkoutByExternalSourceId,
} from '../db/workoutDbManager.js'

const log = createLogger('jobs.crossfit-wod-backfill')

const PROGRAM_NAME = 'CrossFit Mainsite WOD'
const EXTERNAL_SOURCE_PREFIX = 'crossfit-mainsite:'
const DEFAULT_DAYS = 7

export interface CrossfitWodBackfillJobDeps {
  days?: number
  fetchWod?: (date: Date) => Promise<NormalizedCrossfitWod | null>
}

/**
 * Walks the last N days (Pacific) and upserts each day's published WOD into
 * the public "CrossFit Mainsite WOD" program. Same per-day path as the daily
 * cron — `Workout.externalSourceId` is unique, so already-saved days no-op
 * and the run is safe to repeat.
 *
 * Sequential by design: it's polite to crossfit.com and the logs read in
 * date order. Days that come back as drafts / 5xx / missing are logged and
 * skipped; only DB write errors propagate (so the dispatcher exits non-zero).
 */
export async function runCrossfitWodBackfillJob(
  deps: CrossfitWodBackfillJobDeps = {},
): Promise<void> {
  const days = deps.days ?? DEFAULT_DAYS
  const fetchWod = deps.fetchWod ?? fetchCrossfitWod

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

    const payload = await fetchWod(date)
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
}
