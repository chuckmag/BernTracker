#!/usr/bin/env node
/**
 * Worktree-aware `npm run dev` replacement.
 *
 * This script is the canonical reference for how `npm run dev:worktree` works
 * — the root CLAUDE.md points here for details rather than duplicating them.
 *
 * Behavior:
 * 1. Picks free API + web ports via scripts/find-free-ports.mjs and writes
 *    them to .dev-ports.local at the worktree root. Random port within
 *    API [3001, 5000) and web [5174, 7000); defaults 3000 / 5173 are reserved
 *    for non-worktree `turbo dev`.
 * 2. Records the orchestrator's PID in .dev-pids.local. The companion
 *    `npm run dev:worktree:stop` reads this file to terminate **only this
 *    worktree's stack**, never sibling worktrees. If a stale .dev-pids.local
 *    exists at startup with a still-alive PID, this script refuses to start
 *    and tells the operator to run the stop script first.
 * 3. Spawns `npm run dev:api` with API_PORT set, and `npm run dev:web` with
 *    WEB_PORT set. Vite's proxy reads API_PORT to forward `/api/*` to the
 *    correct backend port.
 * 4. Forwards stdout / stderr from both children with a [api] / [web] prefix
 *    so the engineer can see both streams in one terminal.
 * 5. **Self-healing on collision.** If a child crashes within the first
 *    COLLISION_WINDOW_MS with an EADDRINUSE-shaped error (Node's native
 *    string OR Vite's "Port N is (already) in use" wording), it means the
 *    randomly-picked port collided with a sibling worktree starting at the
 *    same instant. The orchestrator re-picks just that role's port (via
 *    `find-free-ports --repick=<role>`), updates .dev-ports.local, and
 *    respawns that child. Capped at MAX_PORT_RETRIES per role with a clear
 *    `[dev:worktree] <role> hit EADDRINUSE on N — retrying on M` log line.
 * 6. Non-collision exits (or exhausted retries) take the surviving sibling
 *    down so the orchestrator never outlives a half-broken pair.
 * 7. On Ctrl-C (interactive) or SIGTERM (from the stop script), sends SIGTERM
 *    to both children, waits for them to exit cleanly, deletes
 *    .dev-pids.local, and quits.
 *
 * Two ways to stop a running stack:
 * - **Interactive shell:** Ctrl-C in the terminal that started it.
 * - **Background / scripted (Claude sessions):** `npm run dev:worktree:stop`
 *   from the same worktree root. **Never** use `pkill node` / `killall node`
 *   — that kills sibling worktrees too and is the foot-gun this script
 *   exists to prevent.
 *
 * After a successful run, downstream tooling (npm run test:worktree, the
 * test:e2e command) reads .dev-ports.local to know where the live stack is.
 *
 * Troubleshooting:
 * - "Stack is already running (PID N)" on startup — a previous run didn't
 *   clean up its PID file. Run `npm run dev:worktree:stop` to terminate it,
 *   or, if you know that PID is dead, delete .dev-pids.local manually.
 * - "API URL printed but `curl` 404s" — proxy target wasn't set; confirm
 *   API_PORT made it into the web child's env (printed `[web]` lines log
 *   the resolved proxy target on Vite startup).
 * - "Both children keep crashing on the same port" — the retry cap was hit;
 *   run `npm run dev:worktree:stop`, then `lsof -i :<port>` to find any
 *   stale external listener, then restart.
 * - "I want a fixed port" — skip this script and use `npm run dev:api` /
 *   `npm run dev:web` directly with explicit `API_PORT=` / `WEB_PORT=` env.
 */
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pidsFile = resolve(root, '.dev-pids.local')

// Stale-PID guard: if a previous run left .dev-pids.local behind and that PID
// is still alive, refuse to start. Otherwise, ignore the stale file.
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

if (existsSync(pidsFile)) {
  let stale = null
  try {
    stale = JSON.parse(readFileSync(pidsFile, 'utf8'))
  } catch {
    // unreadable / corrupt — treat as stale
  }
  if (stale && typeof stale.orchestratorPid === 'number' && isProcessAlive(stale.orchestratorPid)) {
    console.error(`[dev:worktree] A dev stack is already running in this worktree (PID ${stale.orchestratorPid}).`)
    console.error('[dev:worktree] Run \`npm run dev:worktree:stop\` to terminate it before starting a new one.')
    process.exit(1)
  }
}

// Write our own PID before doing anything else, so the stop script has a
// target even if startup fails partway through.
writeFileSync(pidsFile, JSON.stringify({ orchestratorPid: process.pid }, null, 2) + '\n')

function cleanupPidsFile() {
  try { unlinkSync(pidsFile) } catch {}
}
// 'exit' fires for any normal termination (process.exit, end of event loop,
// or after our SIGINT/SIGTERM handlers run process.exit). It does NOT fire
// on SIGKILL — but the stop script's job in that case is to clean up the
// file itself, so we're covered.
process.on('exit', cleanupPidsFile)

// Children sometimes log EADDRINUSE long after they've actually been running
// (e.g. an HMR reload that hits a port that just closed). Only treat it as a
// startup-time collision if it happens within this window.
const COLLISION_WINDOW_MS = 10_000
const MAX_PORT_RETRIES = 3

// Matches both Node's native error string ("Error: listen EADDRINUSE: address
// already in use") and Vite's friendlier wording when strictPort is set
// ("Port 5174 is in use, ..." / "Port 5174 is already in use"). Either form
// signals the same problem.
const COLLISION_PATTERN = /EADDRINUSE|Port \d+ is (?:already )?in use/

function discoverPorts(repickRole = null) {
  const args = [resolve(here, 'find-free-ports.mjs')]
  if (repickRole) args.push(`--repick=${repickRole}`)
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.status !== 0) {
    throw new Error(`find-free-ports${repickRole ? ` --repick=${repickRole}` : ''} exited with ${result.status}`)
  }
  return JSON.parse(readFileSync(resolve(root, '.dev-ports.local'), 'utf8'))
}

let ports = discoverPorts()

console.log('')
console.log('────────────────────────────────────────────')
console.log(` API: ${ports.apiUrl}`)
console.log(` Web: ${ports.webUrl}`)
console.log('────────────────────────────────────────────')
console.log('')

const colors = { api: '36', web: '35' }
const commands = { api: ['npm', ['run', 'dev:api']], web: ['npm', ['run', 'dev:web']] }

function envForRole(role) {
  // Both roles need API_PORT in env: the api server binds to it, and the
  // web server's vite config reads it to wire up the /api proxy target.
  return {
    ...process.env,
    API_PORT: String(ports.apiPort),
    WEB_PORT: String(ports.webPort),
  }
}

function spawnRole(role) {
  const [command, args] = commands[role]
  const child = spawn(command, args, { cwd: root, env: envForRole(role), shell: false })
  const prefix = `\x1b[${colors[role]}m[${role}]\x1b[0m `

  // Watch stderr (and stdout — Vite's friendly message goes to stdout) for the
  // collision pattern, but only during the startup window. After that, treat
  // the process as healthy and ignore the message.
  const startedAt = Date.now()
  let sawCollision = false

  function pipe(stream, target) {
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buf += chunk
      if (!sawCollision && Date.now() - startedAt < COLLISION_WINDOW_MS && COLLISION_PATTERN.test(buf)) {
        sawCollision = true
      }
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) target.write(prefix + line + '\n')
    })
    stream.on('end', () => { if (buf) target.write(prefix + buf + '\n') })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)

  child._sawCollision = () => sawCollision
  return child
}

const children = { api: spawnRole('api'), web: spawnRole('web') }
const retryCounts = { api: 0, web: 0 }

let shuttingDown = false
function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of Object.values(children)) {
    if (child && !child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

function attachExitHandler(role, child) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return

    const collided = child._sawCollision()
    if (collided && retryCounts[role] < MAX_PORT_RETRIES) {
      retryCounts[role]++
      const oldPort = role === 'api' ? ports.apiPort : ports.webPort
      try {
        ports = discoverPorts(role)
      } catch (err) {
        console.error(`[dev:worktree] Failed to repick ${role} port: ${err.message}`)
        shutdown()
        return
      }
      const newPort = role === 'api' ? ports.apiPort : ports.webPort
      console.log('')
      console.log(`[dev:worktree] ${role} hit EADDRINUSE on ${oldPort} — retrying on ${newPort} (attempt ${retryCounts[role]}/${MAX_PORT_RETRIES})`)
      console.log('')
      const next = spawnRole(role)
      children[role] = next
      attachExitHandler(role, next)
      return
    }

    if (collided && retryCounts[role] >= MAX_PORT_RETRIES) {
      console.error(`[dev:worktree] ${role} exhausted ${MAX_PORT_RETRIES} port retries — giving up.`)
    }

    // Non-retryable exit (or exhausted retries): take the whole stack down so
    // we don't outlive a half-broken pair.
    shutdown()
    // Wait for the surviving sibling to also exit before propagating the code.
    const siblings = Object.values(children)
    const allDead = siblings.every((c) => c.exitCode !== null || c.signalCode !== null)
    if (allDead) process.exit(code ?? (signal ? 1 : 0))
  })
}

for (const [role, child] of Object.entries(children)) attachExitHandler(role, child)
