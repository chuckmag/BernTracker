#!/usr/bin/env node
/**
 * Runs API integration tests or Playwright E2E against the dev stack started
 * by `npm run dev:worktree`. Reads .dev-ports.local for the live URLs and
 * propagates them as env vars (API_URL / WEB_URL) into the existing test
 * commands — no changes needed to apps/api or apps/web's own test scripts.
 *
 * Usage:
 *   npm run test:worktree -- api                  # apps/api integration tests
 *   npm run test:worktree -- e2e [extra args...]  # apps/web Playwright E2E
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const portsFile = resolve(root, '.dev-ports.local')

if (!existsSync(portsFile)) {
  console.error('Error: .dev-ports.local not found. Start the worktree dev stack first:')
  console.error('  npm run dev:worktree')
  process.exit(1)
}

const ports = JSON.parse(readFileSync(portsFile, 'utf8'))
const target = process.argv[2]
const extraArgs = process.argv.slice(3)

if (target !== 'api' && target !== 'e2e') {
  console.error('Usage: npm run test:worktree -- {api | e2e} [extra args]')
  process.exit(1)
}

const env = {
  ...process.env,
  API_URL: `${ports.apiUrl}/api`,
  WEB_URL: ports.webUrl,
  API_PORT: String(ports.apiPort),
  WEB_PORT: String(ports.webPort),
}

const cmd = 'npm'
const args = target === 'api'
  ? ['run', 'test', '--workspace=@berntracker/api']
  : ['run', 'test:e2e', '--workspace=@berntracker/web', '--', ...extraArgs]

console.log(`[test:worktree] target=${target} API_URL=${env.API_URL} WEB_URL=${env.WEB_URL}`)
const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
