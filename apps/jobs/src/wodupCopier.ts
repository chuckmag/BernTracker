import { WorkoutStatus } from '@wodalytics/db'
import { createLogger } from '@wodalytics/server'
import {
  fetchWodUpWeek,
  type FetchImpl,
  type WodUpWod,
  type WodUpComponent,
} from './lib/wodupClient.js'
import { classifyWorkoutType } from './lib/crossfitWodClassifier.js'
import {
  createProgramByName,
  ensureProgramIsPublic,
  findProgramByName,
  createWorkoutForProgram,
  findWorkoutByExternalSourceId,
} from '@wodalytics/db'

const log = createLogger('jobs.wodup-copier')

const PROGRAM_NAME = 'CrossFit Override'
const EXTERNAL_SOURCE_PREFIX = 'wodup:'

export interface WodupCopierJobDeps {
  fetchImpl?: FetchImpl
}

/**
 * Fetches one week of gym-programmed workouts from WODup and upserts them
 * into the "CrossFit Override" program in WODalytics.
 *
 *   - Requires: WODUP_SESSION_TOKEN env var (browser session cookie, ~4 month TTL).
 *     Throws if missing so the Railway run is flagged immediately.
 *   - Fetches Monday–Sunday of the current UTC week.
 *   - Idempotent: externalSourceId = "wodup:<wodId>" prevents duplicate writes.
 *   - Multi-component WODs (A/B/C) are merged into one WODalytics workout.
 *   - Soft-fails on upstream errors (empty week → no writes, no crash).
 *   - Creates the program automatically on first run.
 *
 * `deps.fetchImpl` lets tests inject a stub without hitting wodup.com.
 */
export async function runWodupCopierJob(deps: WodupCopierJobDeps = {}): Promise<void> {
  const sessionToken = process.env.WODUP_SESSION_TOKEN
  if (!sessionToken) {
    throw new Error('WODUP_SESSION_TOKEN env var is required but not set')
  }

  log.info(`step: lookup program "${PROGRAM_NAME}"`)
  let program = await findProgramByName(PROGRAM_NAME)
  if (!program) {
    log.info(`program "${PROGRAM_NAME}" not found — creating it`)
    program = await createProgramByName(PROGRAM_NAME)
    log.info(`step: created program id=${program.id}`)
  } else if (program.visibility !== 'PUBLIC') {
    log.info(`program "${PROGRAM_NAME}" was ${program.visibility} — flipping to PUBLIC`)
    await ensureProgramIsPublic(program.id)
    log.info(`step: flipped program ${program.id} to PUBLIC`)
  } else {
    log.info(`step: fetched program id=${program.id} visibility=${program.visibility}`)
  }

  const { startDate, endDate } = currentWeekRange(new Date())
  const startIso = startDate.toISOString().slice(0, 10)
  const endIso = endDate.toISOString().slice(0, 10)
  log.info(`step: fetching WODup workouts ${startIso} → ${endIso}`)

  const wods = await fetchWodUpWeek(startDate, endDate, sessionToken, deps.fetchImpl)
  log.info(`step: received ${wods.length} wod(s) from WODup`)

  if (wods.length === 0) {
    log.info('step: no wods returned — upstream error or empty week, exiting cleanly')
    return
  }

  let saved = 0
  let skipped = 0

  for (const wod of wods) {
    const externalSourceId = `${EXTERNAL_SOURCE_PREFIX}${wod.id}`

    const existing = await findWorkoutByExternalSourceId(externalSourceId)
    if (existing) {
      log.info(`${externalSourceId} already saved — no-op`)
      skipped++
      continue
    }

    const content = buildWorkoutContent(wod)
    if (!content) {
      log.info(`${externalSourceId} has no main components (warmup-only WOD) — skipping`)
      skipped++
      continue
    }
    const { title, description } = content
    const type = classifyWorkoutType(description)
    // Noon UTC on the scheduled date keeps the workout in the right calendar
    // day regardless of the viewer's timezone offset.
    const scheduledAt = new Date(`${wod.occursOn}T12:00:00Z`)

    log.info(`step: creating workout externalId=${wod.id} date=${wod.occursOn} type=${type}`)
    await createWorkoutForProgram({
      programId: program.id,
      title,
      description,
      type,
      scheduledAt,
      status: WorkoutStatus.PUBLISHED,
      externalSourceId,
    })
    saved++
    log.info(`saved ${externalSourceId} (${type})`)
  }

  log.info(`done: saved=${saved} skipped=${skipped}`)
}

/**
 * Returns Monday and Sunday of the week containing `now` (UTC).
 * Follows ISO 8601 convention: week starts on Monday.
 */
export function currentWeekRange(now: Date): { startDate: Date; endDate: Date } {
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon ... 6=Sat
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday),
  )
  const sunday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6),
  )
  return { startDate: monday, endDate: sunday }
}

/**
 * Builds the WODalytics title and description from a WODup WOD.
 *
 * Components with `prefix === null` are WarmUp entries — they are skipped
 * so only the main workout components (A, B, C...) are included. If a WOD
 * has ONLY warmup components (standalone mobility WODs) it returns null and
 * the caller skips it.
 *
 * Single main component: title = workout name (or label or date).
 * Multi main component:  title = wod name or date; desc = "A: name\nbody\n\nB: ..."
 */
function buildWorkoutContent(
  wod: WodUpWod,
): { title: string; description: string } | null {
  // Skip prefix:null components — those are WarmUp entries
  const components = wod.wodComponents.filter((c) => c.prefix !== null)

  if (components.length === 0) return null

  if (components.length === 1) {
    const c = components[0]!
    const body = componentBody(c)
    const title = wod.name?.trim() || c.workout.name?.trim() || c.workout.description?.trim() || wod.occursOn
    return { title, description: body || title }
  }

  const title = wod.name?.trim() || wod.occursOn
  const parts = components.map((c) => {
    const label = c.workout.name?.trim() || c.workout.description?.trim() || ''
    const header = label ? `${c.prefix}: ${label}` : String(c.prefix)
    const body = componentBody(c)
    return body ? `${header}\n${body}` : header
  })
  return { title, description: parts.join('\n\n') }
}

/**
 * Returns the full prescription text for a single component.
 *
 * WODup stores the full text in two different places depending on workout type:
 *   - Generic/WarmUp: `details.description` (can be several paragraphs)
 *   - Named/Strength (ForTime, FranStyle, Strength...): `workout.description`
 *     is the prescription; `details` has movement IDs but no prose description
 */
function componentBody(c: WodUpComponent): string {
  const details = c.workout.details as Record<string, unknown> | null | undefined
  const detailsDesc = details?.['description']
  if (typeof detailsDesc === 'string' && detailsDesc.trim()) return detailsDesc.trim()
  return c.workout.description?.trim() ?? ''
}
