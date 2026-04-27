#!/usr/bin/env node
/**
 * Picks two free TCP ports — one for the API, one for the web — and writes
 * them to `.dev-ports.local` at the repo (or worktree) root. Used by
 * `npm run dev:worktree` so parallel worktrees don't collide on the
 * default 3000 / 5173 ports.
 *
 * Output (also stdout JSON):
 *   {
 *     "apiPort": 3001,
 *     "webPort": 5174,
 *     "apiUrl":  "http://localhost:3001",
 *     "webUrl":  "http://localhost:5174"
 *   }
 *
 * The file is gitignored. Tooling (test runners, the dev orchestrator) reads
 * it to wire up env vars without prompting the operator.
 */
import net from 'node:net'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Skip the canonical defaults (3000 / 5173) so worktrees never race a
// concurrent `turbo dev` / `npm run dev:api`/`dev:web` running on its
// reserved port. Engineers who want default ports should skip the
// worktree script entirely.
const API_BASE = 3001
const WEB_BASE = 5174
const SCAN_RANGE = 100  // tries [base, base + SCAN_RANGE)

function probeHost(port, host) {
  return new Promise((resolveProbe) => {
    const server = net.createServer()
    server.once('error', () => resolveProbe(false))
    server.once('listening', () => server.close(() => resolveProbe(true)))
    server.listen(port, host)
  })
}

// Probe both IPv4 and IPv6 — Vite binds dual-stack on macOS, so a process
// listening only on `[::1]` (IPv6) would still cause Vite to fail with
// EADDRINUSE even though `127.0.0.1` is technically free.
async function isFree(port) {
  return (await probeHost(port, '127.0.0.1')) && (await probeHost(port, '::1'))
}

async function findFreePort(start, taken = new Set()) {
  for (let port = start; port < start + SCAN_RANGE; port++) {
    if (taken.has(port)) continue
    if (await isFree(port)) return port
  }
  throw new Error(`No free port in [${start}, ${start + SCAN_RANGE})`)
}

const apiPort = await findFreePort(API_BASE)
// Avoid the case where API_BASE and WEB_BASE collapse to the same port.
const webPort = await findFreePort(WEB_BASE, new Set([apiPort]))

const result = {
  apiPort,
  webPort,
  apiUrl: `http://localhost:${apiPort}`,
  webUrl: `http://localhost:${webPort}`,
}

const out = resolve(process.cwd(), '.dev-ports.local')
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
process.stdout.write(JSON.stringify(result) + '\n')
