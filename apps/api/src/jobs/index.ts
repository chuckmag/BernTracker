import { prisma } from '@berntracker/db'
import { createLogger } from '../lib/logger.js'

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

  log.info(`starting ${jobName}`)
  try {
    await handler()
    log.info(`finished ${jobName}`)
    return 0
  } catch (err) {
    log.error(`${jobName} failed: ${err instanceof Error ? err.message : err}`, err)
    return 1
  }
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async (err) => {
    log.error(`dispatcher crashed: ${err instanceof Error ? err.message : err}`, err)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
  })
