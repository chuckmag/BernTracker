import { prisma } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'
import { runCrossfitWodJob } from './crossfitWod.js'

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
}

// Env vars the API codebase reads. Logged (presence only, never values) at
// dispatch start so a Railway run with missing wiring reveals it in the first
// few lines rather than as a silent downstream failure.
const TRACKED_ENV_VARS = [
  'DATABASE_URL',
  'NODE_ENV',
  'TZ',
  'PORT',
  'API_PORT',
  'ALLOWED_ORIGINS',
  'FRONTEND_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MOVEMENT_REVIEWER_EMAIL',
  'AWS_S3_BUCKET',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_PUBLIC_URL_BASE',
  'LOCAL_UPLOADS_ROOT',
] as const

// Returns the host (and optionally db name) from a postgres URL without
// exposing credentials. Useful for confirming the cron is pointed at the
// expected Railway DB without leaking the password into logs.
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
  log.info(`runtime — node=${process.version} platform=${process.platform} arch=${process.arch} cwd=${process.cwd()}`)
  log.info(`database — ${summarizeDatabaseUrl(process.env.DATABASE_URL)}`)
  const envSummary = TRACKED_ENV_VARS.map((k) => `${k}=${process.env[k] ? 'set' : 'missing'}`).join(' ')
  log.info(`env — ${envSummary}`)
  // ICU/tz sanity — todayInPacific() depends on Intl.DateTimeFormat being able
  // to resolve America/Los_Angeles. Alpine images historically ship with
  // small-icu, which can cause silent fallback to UTC.
  try {
    const sample = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles' }).format(new Date())
    log.info(`intl — America/Los_Angeles resolved to "${sample}"`)
  } catch (err) {
    log.error(`intl — America/Los_Angeles lookup failed: ${err instanceof Error ? err.message : err}`)
  }
}

async function main(): Promise<number> {
  const jobName = process.argv[2]

  if (!jobName) {
    log.error('no job name provided. usage: node dist/jobs/index.js <jobName>')
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
