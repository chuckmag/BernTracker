import { WorkoutStatus } from '@berntracker/db'
import { createLogger } from '../lib/logger.js'
import {
  fetchCrossfitWod,
  type NormalizedCrossfitWod,
} from '../lib/crossfitWodClient.js'
import { classifyWorkoutType } from '../lib/crossfitWodClassifier.js'
import { findProgramByName } from '../db/programDbManager.js'
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
 *   - Soft-fail on upstream issues: if the program isn't seeded yet, or
 *     CrossFit returns a draft / 5xx / malformed payload, the function
 *     resolves cleanly and the next tick retries.
 *   - Hard-fail on local issues: DB write errors and unexpected exceptions
 *     propagate so the dispatcher exits non-zero (Railway flags the run).
 *
 * `deps.fetchWod` lets tests inject a stub so this can run against a real DB
 * without hitting crossfit.com. Defaults to the real `fetchCrossfitWod`.
 */
export async function runCrossfitWodJob(deps: CrossfitWodJobDeps = {}): Promise<void> {
  const fetchWod = deps.fetchWod ?? fetchCrossfitWod

  const program = await findProgramByName(PROGRAM_NAME)
  if (!program) {
    log.warning(`program "${PROGRAM_NAME}" not found — skipping (seed it before enabling the cron)`)
    return
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

/**
 * Returns midnight of "today" in America/Los_Angeles, expressed as a UTC Date.
 * The job uses this to ask the upstream API for today's WOD on Pacific time —
 * which is when the CrossFit team posts.
 *
 * Uses Intl.DateTimeFormat (no Temporal / dayjs dep) — extracts y/m/d in PT,
 * then constructs a UTC Date from those components. Downstream consumers only
 * read getUTC*() so the absolute instant is irrelevant.
 */
function todayInPacific(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  return new Date(Date.UTC(y, m - 1, d))
}
