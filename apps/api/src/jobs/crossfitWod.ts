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

const log = createLogger('jobs.crossfit-wod')

const PROGRAM_NAME = 'CrossFit Mainsite WOD'
const EXTERNAL_SOURCE_PREFIX = 'crossfit-mainsite:'

export interface CrossfitWodJobDeps {
  fetchWod?: (date: Date) => Promise<NormalizedCrossfitWod | null>
}

/**
 * Fetches today's CrossFit Mainsite WOD and upserts it into the public
 * "CrossFit Mainsite WOD" program. Designed for a 15-minute cron tick:
 *
 *   - Idempotent: the unique externalSourceId column means a same-day re-run
 *     short-circuits with a no-op log.
 *   - Self-bootstrapping: creates the public program on first run if it
 *     doesn't exist yet, so no manual seed step is required.
 *   - Soft-fail on upstream issues: if CrossFit returns a draft / 5xx /
 *     malformed payload, the function resolves cleanly and the next tick
 *     retries.
 *   - Hard-fail on local issues: DB write errors and unexpected exceptions
 *     propagate so the dispatcher exits non-zero (Railway flags the run).
 *
 * `deps.fetchWod` lets tests inject a stub so this can run against a real DB
 * without hitting crossfit.com. Defaults to the real `fetchCrossfitWod`.
 */
export async function runCrossfitWodJob(deps: CrossfitWodJobDeps = {}): Promise<void> {
  const fetchWod = deps.fetchWod ?? fetchCrossfitWod

  let program = await findProgramByName(PROGRAM_NAME)
  if (!program) {
    log.info(`program "${PROGRAM_NAME}" not found — creating it`)
    program = await createProgramByName(PROGRAM_NAME)
  }

  const today = todayInPacific()
  const payload = await fetchWod(today)
  if (!payload) {
    // Client already logged the reason. Nothing to do this tick.
    return
  }

  const externalSourceId = `${EXTERNAL_SOURCE_PREFIX}${payload.externalId}`

  const existing = await findWorkoutByExternalSourceId(externalSourceId)
  if (existing) {
    log.info(`${externalSourceId} already saved — no-op`)
    return
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
  log.info(`saved ${externalSourceId} (${type})`)
}
