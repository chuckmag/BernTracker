#!/usr/bin/env node
/**
 * Worktree-aware `npm run dev` replacement.
 *
 * 1. Picks free API + web ports (via scripts/find-free-ports.mjs) and writes
 *    them to .dev-ports.local at the worktree root.
 * 2. Spawns `npm run dev:api` with API_PORT set, and `npm run dev:web` with
 *    WEB_PORT set. Vite's proxy reads API_PORT to forward `/api/*` to the
 *    correct backend port.
 * 3. Forwards stdout / stderr from both children with a [api] / [web] prefix
 *    so the engineer can see both streams in one terminal.
 * 4. On Ctrl-C, sends SIGTERM to both children and waits for them to exit
 *    cleanly before quitting.
 *
 * After a successful run, downstream tooling (npm run test:worktree, the
 * test:e2e command) reads .dev-ports.local to know where the live stack is.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// Step 1 — discover and persist ports.
await new Promise((resolveStep, rejectStep) => {
  const child = spawn(process.execPath, [resolve(here, 'find-free-ports.mjs')], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  child.once('error', rejectStep)
  child.once('exit', (code) => {
    if (code === 0) resolveStep()
    else rejectStep(new Error(`find-free-ports exited with ${code}`))
  })
})

const ports = JSON.parse(readFileSync(resolve(root, '.dev-ports.local'), 'utf8'))

const env = {
  ...process.env,
  API_PORT: String(ports.apiPort),
  WEB_PORT: String(ports.webPort),
}

console.log('')
console.log('────────────────────────────────────────────')
console.log(` API: ${ports.apiUrl}`)
console.log(` Web: ${ports.webUrl}`)
console.log('────────────────────────────────────────────')
console.log('')

// Step 2 — spawn both dev servers. Use prefixes so output is interleaved-but-readable.
function spawnTagged(tag, color, command, args) {
  const child = spawn(command, args, { cwd: root, env, shell: false })
  const prefix = `\x1b[${color}m[${tag}]\x1b[0m `
  function pipe(stream, target) {
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) target.write(prefix + line + '\n')
    })
    stream.on('end', () => { if (buf) target.write(prefix + buf + '\n') })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  return child
}

const api = spawnTagged('api', '36', 'npm', ['run', 'dev:api'])
const web = spawnTagged('web', '35', 'npm', ['run', 'dev:web'])

let shuttingDown = false
function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of [api, web]) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

let exited = 0
function onExit(code) {
  exited++
  // If one child dies, take the other down with it so the orchestrator doesn't
  // outlive a half-broken stack.
  if (exited === 1) shutdown()
  if (exited === 2) process.exit(code ?? 0)
}

api.on('exit', onExit)
web.on('exit', onExit)
