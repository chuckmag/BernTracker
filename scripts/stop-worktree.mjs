#!/usr/bin/env node
/**
 * Deterministic shutdown for `npm run dev:worktree`.
 *
 * Why this exists: a Claude session (or any background scripted workflow)
 * needs to tear down its own dev stack at the end of a task without killing
 * sibling worktrees. `pkill node` / `killall node` are foot-guns — they kill
 * every Node process on the box, including parallel worktrees that are still
 * working. This script is the **only** sanctioned way to stop a stack from
 * outside the orchestrator's interactive terminal.
 *
 * Algorithm:
 * 1. Read .dev-pids.local. If it has a live orchestrator PID, send SIGINT.
 *    The orchestrator's existing handler forwards SIGTERM to its children
 *    and exits cleanly. Wait up to TERM_GRACE_MS for it to die.
 * 2. If the orchestrator didn't exit in time, send SIGKILL.
 * 3. Belt-and-suspenders: read .dev-ports.local and `lsof -ti :<port>` for
 *    the API and web ports. SIGKILL anything still listening — these are
 *    detached / orphaned children whose orchestrator already died.
 * 4. Delete .dev-pids.local and .dev-ports.local. The worktree is now in
 *    a clean state — `npm run dev:worktree` can be run again immediately.
 *
 * Idempotent: if neither file exists, exits 0 with a "nothing to clean up"
 * message. Safe to run repeatedly.
 *
 * Important: kills are scoped to **this worktree's** PID + ports. Sibling
 * worktrees in other directories have their own .dev-pids.local /
 * .dev-ports.local and are not touched.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pidsFile = resolve(root, '.dev-pids.local')
const portsFile = resolve(root, '.dev-ports.local')

// How long to wait for the orchestrator to gracefully shut down its children
// after SIGINT before escalating to SIGKILL. The orchestrator itself tends to
// take ~100ms; the children (nodemon, vite) can take 1-2s to wind down.
const TERM_GRACE_MS = 4000
const POLL_INTERVAL_MS = 100

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await sleep(POLL_INTERVAL_MS)
  }
  return !isProcessAlive(pid)
}

function pidsListeningOnPort(port) {
  // -t = terse (PIDs only, one per line). -i :<port> = sockets bound to that
  // TCP/UDP port. -sTCP:LISTEN restricts to listeners (the dev servers we
  // care about) and skips short-lived client connections.
  const result = spawnSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (result.status !== 0) return [] // lsof exits 1 when nothing matches; treat as empty
  return result.stdout
    .split('\n')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
}

let touchedAnything = false

// Step 1: SIGINT the orchestrator.
let orchestratorPid = null
if (existsSync(pidsFile)) {
  try {
    const data = JSON.parse(readFileSync(pidsFile, 'utf8'))
    if (typeof data.orchestratorPid === 'number') orchestratorPid = data.orchestratorPid
  } catch {
    // corrupt — treat as no PID
  }
}

if (orchestratorPid && isProcessAlive(orchestratorPid)) {
  touchedAnything = true
  console.log(`[dev:worktree:stop] Sending SIGINT to orchestrator PID ${orchestratorPid}`)
  try {
    process.kill(orchestratorPid, 'SIGINT')
  } catch (err) {
    console.error(`[dev:worktree:stop] SIGINT failed: ${err.message}`)
  }
  const exited = await waitForExit(orchestratorPid, TERM_GRACE_MS)
  if (!exited) {
    console.log(`[dev:worktree:stop] Orchestrator did not exit within ${TERM_GRACE_MS}ms — escalating to SIGKILL`)
    try { process.kill(orchestratorPid, 'SIGKILL') } catch {}
    await waitForExit(orchestratorPid, 1000)
  }
}

// Step 2: belt-and-suspenders — kill anything still on this worktree's ports.
if (existsSync(portsFile)) {
  let ports = null
  try {
    ports = JSON.parse(readFileSync(portsFile, 'utf8'))
  } catch {
    // corrupt — skip
  }
  if (ports) {
    for (const [role, port] of [['api', ports.apiPort], ['web', ports.webPort]]) {
      if (typeof port !== 'number') continue
      const stragglers = pidsListeningOnPort(port)
      if (stragglers.length === 0) continue
      touchedAnything = true
      console.log(`[dev:worktree:stop] ${role} port ${port} still has listeners ${stragglers.join(', ')} — SIGKILL`)
      for (const pid of stragglers) {
        try { process.kill(pid, 'SIGKILL') } catch {}
      }
    }
  }
}

// Step 3: clean state files.
for (const f of [pidsFile, portsFile]) {
  if (existsSync(f)) {
    touchedAnything = true
    try { unlinkSync(f) } catch (err) {
      console.error(`[dev:worktree:stop] Failed to delete ${f}: ${err.message}`)
    }
  }
}

if (!touchedAnything) {
  console.log('[dev:worktree:stop] Nothing to clean up — no .dev-pids.local or .dev-ports.local found, no listeners on tracked ports.')
} else {
  console.log('[dev:worktree:stop] Done. Worktree is clean.')
}
