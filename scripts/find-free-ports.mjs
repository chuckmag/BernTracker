#!/usr/bin/env node
/**
 * Picks free TCP ports for the worktree dev stack and persists them to
 * `.dev-ports.local` at the repo (or worktree) root. Used by
 * `npm run dev:worktree` so parallel worktrees don't collide on the
 * default 3000 / 5173 ports.
 *
 * Modes:
 *   find-free-ports.mjs                 # picks both api + web, writes the file
 *   find-free-ports.mjs --repick=api    # re-picks just the api port, rewrites the file
 *   find-free-ports.mjs --repick=web    # re-picks just the web port, rewrites the file
 *
 * Output (also stdout JSON):
 *   {
 *     "apiPort": 3217,
 *     "webPort": 5491,
 *     "apiUrl":  "http://localhost:3217",
 *     "webUrl":  "http://localhost:5491"
 *   }
 *
 * Selection strategy: pick a random starting port within each role's range,
 * then scan forward with wraparound. Random start eliminates the hot-port
 * hot-spot where every parallel worktree probes the same port first and
 * races the eventual server bind. The orchestrator (dev-worktree.mjs)
 * still retries on EADDRINUSE to handle the rare random collision.
 *
 * Defaults 3000 / 5173 are reserved for non-worktree `turbo dev`.
 *
 * The file is gitignored. Tooling (test runners, the dev orchestrator) reads
 * it to wire up env vars without prompting the operator.
 */
import net from 'node:net'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// [start, end) — `end` is exclusive. Both ranges intentionally skip the
// canonical defaults (3000, 5173) so worktrees can never race a concurrent
// `turbo dev` / `npm run dev:api`/`dev:web` running on its reserved port.
const RANGES = {
  api: { start: 3001, end: 5000 },
  web: { start: 5174, end: 7000 },
}

// Probe both IPv4 and IPv6 — Express defaults to one stack, Vite defaults to
// the other, and a sibling worktree on either is enough to fail the actual
// server bind even if the other stack looks clear. Treat the port as free
// only if both binds succeed.
function probeHost(port, host) {
  return new Promise((resolveProbe) => {
    const server = net.createServer()
    server.once('error', () => resolveProbe(false))
    server.once('listening', () => server.close(() => resolveProbe(true)))
    server.listen(port, host)
  })
}

async function isFree(port) {
  return (await probeHost(port, '127.0.0.1')) && (await probeHost(port, '::1'))
}

async function findFreePortInRange(range, taken = new Set()) {
  const span = range.end - range.start
  const startOffset = Math.floor(Math.random() * span)
  for (let i = 0; i < span; i++) {
    const port = range.start + ((startOffset + i) % span)
    if (taken.has(port)) continue
    if (await isFree(port)) return port
  }
  throw new Error(`No free port in [${range.start}, ${range.end})`)
}

function buildResult(apiPort, webPort) {
  return {
    apiPort,
    webPort,
    apiUrl: `http://localhost:${apiPort}`,
    webUrl: `http://localhost:${webPort}`,
  }
}

function persist(result) {
  const out = resolve(process.cwd(), '.dev-ports.local')
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
  process.stdout.write(JSON.stringify(result) + '\n')
}

const repickArg = process.argv.find((a) => a.startsWith('--repick='))
const repickRole = repickArg ? repickArg.split('=')[1] : null

if (repickRole && repickRole !== 'api' && repickRole !== 'web') {
  console.error(`Invalid --repick value: ${repickRole}. Expected 'api' or 'web'.`)
  process.exit(1)
}

if (repickRole) {
  const portsFile = resolve(process.cwd(), '.dev-ports.local')
  if (!existsSync(portsFile)) {
    console.error('Error: .dev-ports.local not found. Run without --repick to generate it first.')
    process.exit(1)
  }
  const existing = JSON.parse(readFileSync(portsFile, 'utf8'))
  // Avoid handing back the *other* role's current port.
  const taken = new Set([repickRole === 'api' ? existing.webPort : existing.apiPort])
  const newPort = await findFreePortInRange(RANGES[repickRole], taken)
  const next = repickRole === 'api'
    ? buildResult(newPort, existing.webPort)
    : buildResult(existing.apiPort, newPort)
  persist(next)
} else {
  const apiPort = await findFreePortInRange(RANGES.api)
  // Ranges don't overlap, but pass `taken` for safety in case they ever do.
  const webPort = await findFreePortInRange(RANGES.web, new Set([apiPort]))
  persist(buildResult(apiPort, webPort))
}
