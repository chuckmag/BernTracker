import { prisma } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'
import { runCrossfitWodJob } from './crossfitWod.js'
import { runSeedCrossfitMovementsJob } from './seedCrossfitMovements.js'

const log = createLogger('jobs')

type JobHandler = () => Promise<void>

// Registry of available jobs. Add new jobs here as they're implemented.
// Each value is an async handler that performs the job's work and resolves
// when finished, or throws to signal failure (the dispatcher will exit
// non-zero so the scheduler — Railway, cron, etc. — can flag the run).
const JOBS: Record<string, JobHandler> = {
  noop: async () => {
    log.info('noop job ran')
  },
  'crossfit-wod': () => runCrossfitWodJob(),
  // One-shot seed (not on a cron schedule) — populates the Movement catalog
  // from CrossFit's published list. Re-running is a no-op on stable rows.
  'seed-crossfit-movements': async () => { await runSeedCrossfitMovementsJob() },
}

// Returns the host (and db name) from a postgres URL without exposing
// credentials. Useful for confirming a cron run is pointed at the expected
// Railway DB without leaking the password into logs.
function summarizeDatabaseUrl(url: string | undefined): string {
  if (!url) return '(unset)'
  try {
    const parsed = new URL(url)
    const db = parsed.pathname.replace(/^\//, '') || '(no db)'
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '(default)'}/${db}`
  } catch {
    return '(unparseable)'
  }
}

function logStartupDiagnostics(jobName: string): void {
  log.info(`dispatcher boot — job=${jobName} pid=${process.pid}`)
  log.info(`runtime — node=${process.version} platform=${process.platform} arch=${process.arch}`)
  log.info(`database — ${summarizeDatabaseUrl(process.env.DATABASE_URL)}`)
}

async function main(): Promise<number> {
  // The container Dockerfile expands $JOB_NAME into argv before exec'ing
  // node, so argv[2] is the canonical path in prod. Falling back to the
  // env var directly keeps the dispatcher convenient to invoke ad-hoc
  // (`JOB_NAME=foo node dist/jobs/index.js`) without changing the wrapper.
  const jobName = process.argv[2] ?? process.env.JOB_NAME

  if (!jobName) {
    log.error('no job name provided. set JOB_NAME or pass as argv[2]')
    return 2
  }

  const handler = JOBS[jobName]
  if (!handler) {
    const available = Object.keys(JOBS).join(', ') || '(none registered)'
    log.error(`unknown job: ${jobName}. available: ${available}`)
    return 2
  }

  logStartupDiagnostics(jobName)
  log.info(`starting ${jobName}`)
  const startedAt = Date.now()
  try {
    await handler()
    log.info(`finished ${jobName} in ${Date.now() - startedAt}ms`)
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    log.error(`${jobName} failed after ${Date.now() - startedAt}ms: ${message}`)
    if (stack) log.error(`${jobName} stack:\n${stack}`)
    return 1
  }
}

// Some hosted log shippers drop output if the process exits before stdout has
// drained. Force a final write+drain before process.exit so the diagnostic
// lines actually reach Railway's logging pipeline.
function flushStdoutThenExit(code: number): void {
  process.stdout.write('', () => process.exit(code))
}

main()
  .then(async (code) => {
    await prisma.$disconnect().catch((err) => {
      log.error(`prisma disconnect failed: ${err instanceof Error ? err.message : err}`)
    })
    flushStdoutThenExit(code)
  })
  .catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    log.error(`dispatcher crashed: ${message}`)
    if (stack) log.error(`dispatcher stack:\n${stack}`)
    await prisma.$disconnect().catch(() => {})
    flushStdoutThenExit(1)
  })
