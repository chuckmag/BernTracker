import { WorkoutStatus } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'
import {
  fetchCrossfitWod,
  type NormalizedCrossfitWod,
} from '../lib/crossfitWodClient.js'
import { classifyWorkoutType } from '../lib/crossfitWodClassifier.js'
import { todayInPacific } from '../lib/pacificDate.js'
import {
  createProgramByName,
  ensureProgramIsPublic,
  findProgramByName,
} from '../db/programDbManager.js'
import {
  countWorkoutsByProgramId,
  createWorkoutForProgram,
  findWorkoutByExternalSourceId,
} from '../db/workoutDbManager.js'

const log = createLogger('jobs.crossfit-wod')

const PROGRAM_NAME = 'CrossFit Mainsite WOD'
const EXTERNAL_SOURCE_PREFIX = 'crossfit-mainsite:'
// Number of prior days to backfill the very first time the job runs against
// an empty program (today is processed afterwards in the normal path, so a
// fresh DB ends up with this many days + 1 of history after the first tick).
const FIRST_RUN_BACKFILL_PRIOR_DAYS = 6

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
 *     doesn't exist yet, and backfills the prior 6 days of WODs the first
 *     time the program has zero workouts — so a fresh deploy lands with a
 *     week of history without any manual operational step.
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

  // Each `step` log marks a milestone the dispatcher's caught-error path can
  // be cross-referenced against — if the QA logs end after `step: lookup
  // program` and never hit `step: fetched program`, the failure is in the DB
  // round-trip rather than the upstream fetch.
  log.info(`step: lookup program "${PROGRAM_NAME}"`)
  let program = await findProgramByName(PROGRAM_NAME)
  if (!program) {
    log.info(`program "${PROGRAM_NAME}" not found — creating it`)
    program = await createProgramByName(PROGRAM_NAME)
    log.info(`step: created program id=${program.id}`)
  } else if (program.visibility !== 'PUBLIC') {
    // Pre-existing rows were created before the default flipped to PUBLIC.
    // Bring them in line so the public-catalog endpoint surfaces them.
    log.info(`program "${PROGRAM_NAME}" was ${program.visibility} — flipping to PUBLIC`)
    await ensureProgramIsPublic(program.id)
    log.info(`step: flipped program ${program.id} to PUBLIC`)
  } else {
    log.info(`step: fetched program id=${program.id} visibility=${program.visibility}`)
  }

  const today = todayInPacific()
  log.info(`step: today (PT) resolved to ${today.toISOString().slice(0, 10)}`)

  await backfillIfFirstRun(program.id, today, fetchWod)

  log.info(`step: fetching today's wod from upstream`)
  const payload = await fetchWod(today)
  if (!payload) {
    // Client already logged the reason. Nothing to do this tick.
    log.info(`step: upstream returned no payload — exiting cleanly`)
    return
  }
  log.info(`step: upstream payload externalId=${payload.externalId} title="${payload.title}"`)

  const externalSourceId = `${EXTERNAL_SOURCE_PREFIX}${payload.externalId}`

  const existing = await findWorkoutByExternalSourceId(externalSourceId)
  if (existing) {
    log.info(`${externalSourceId} already saved — no-op`)
    return
  }

  const type = classifyWorkoutType(payload.descriptionRaw)
  log.info(`step: creating workout type=${type} programId=${program.id}`)
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

/**
 * Runs once per program, ever: when the daily job ticks and finds the program
 * has no workouts at all, walk back FIRST_RUN_BACKFILL_PRIOR_DAYS days and
 * ingest each day's WOD. After the first save the workout count is non-zero,
 * so subsequent ticks skip this entirely. Idempotency via externalSourceId
 * keeps it safe even if the gate were ever wrong.
 */
async function backfillIfFirstRun(
  programId: string,
  today: Date,
  fetchWod: (date: Date) => Promise<NormalizedCrossfitWod | null>,
): Promise<void> {
  const existingCount = await countWorkoutsByProgramId(programId)
  log.info(`step: program ${programId} has ${existingCount} existing workouts`)
  if (existingCount > 0) return

  log.info(`first run on empty program — backfilling ${FIRST_RUN_BACKFILL_PRIOR_DAYS} prior days`)
  for (let offset = 1; offset <= FIRST_RUN_BACKFILL_PRIOR_DAYS; offset++) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset),
    )
    const iso = date.toISOString().slice(0, 10)
    const payload = await fetchWod(date)
    if (!payload) {
      log.info(`backfill ${iso}: no published wod (drafted / missing / upstream error)`)
      continue
    }
    const externalSourceId = `${EXTERNAL_SOURCE_PREFIX}${payload.externalId}`
    const existing = await findWorkoutByExternalSourceId(externalSourceId)
    if (existing) {
      log.info(`backfill ${iso}: ${externalSourceId} already saved — skip`)
      continue
    }
    const type = classifyWorkoutType(payload.descriptionRaw)
    await createWorkoutForProgram({
      programId,
      title: payload.title,
      description: payload.descriptionRaw,
      type,
      scheduledAt: new Date(payload.scheduledAt),
      status: WorkoutStatus.PUBLISHED,
      externalSourceId,
    })
    log.info(`backfill ${iso}: saved ${externalSourceId} (${type})`)
  }
}
