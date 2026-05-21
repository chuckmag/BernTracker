#!/usr/bin/env node
/**
 * PostToolUse hook — spawns watch-pr.mjs as a detached background daemon
 * whenever a `gh pr create` command succeeds and the output contains a GitHub
 * PR URL.
 *
 * Registered in .claude/settings.json:
 *   { "hooks": { "PostToolUse": [{ "matcher": "Bash",
 *       "hooks": [{ "type": "command",
 *                   "command": "node scripts/hooks/spawn-pr-watcher.mjs" }] }] } }
 *
 * Claude Code passes tool context as JSON on stdin:
 *   { tool_name, tool_input: { command }, tool_response: { text, exitCode }, cwd }
 *
 * The hook returns JSON with additionalContext so Claude knows the watcher started.
 * It exits 0 in all cases — failures are reported in additionalContext, never
 * by crashing the hook (which would confuse Claude).
 */
import { spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// In GitHub Actions the project hooks are loaded from origin/main into the
// review action's runner. Spawning a teardown watcher there makes no sense —
// the runner is ephemeral, there's no worktree to tear down.
if (process.env.GITHUB_ACTIONS === 'true') process.exit(0)

const here = dirname(fileURLToPath(import.meta.url))

function reply(additionalContext) {
  // Claude Code reads this JSON and surfaces additionalContext in the session
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext },
  }) + '\n')
}

// ─── Read hook context from stdin ──────────────────────────────────────────
let raw = ''
for await (const chunk of process.stdin) raw += chunk

let ctx
try {
  ctx = JSON.parse(raw)
} catch {
  reply('spawn-pr-watcher: could not parse hook JSON — skipping.')
  process.exit(0)
}

const { tool_name: toolName, tool_input: toolInput, tool_response: toolResponse, cwd } = ctx

// Only care about successful Bash calls
if (toolName !== 'Bash') process.exit(0)
if (toolResponse?.exitCode !== 0) process.exit(0)

const stdout = toolResponse?.text ?? ''
const command = toolInput?.command ?? ''

// Filter: does the output contain a GitHub PR URL?
const prUrlMatch = stdout.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/)
if (!prUrlMatch) process.exit(0)

// Belt-and-suspenders: command should also relate to gh pr
if (!command.includes('gh pr')) process.exit(0)

const prUrl = prUrlMatch[0]
const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1]

// ─── Determine worktree path and main repo root ────────────────────────────
// cwd from hook JSON = the directory Claude was in when the Bash command ran.
// In a linked worktree, <cwd>/.git is a FILE (not a dir) containing the gitdir.
const worktreePath = cwd

if (!cwd || !existsSync(cwd)) {
  reply(`spawn-pr-watcher: cwd not available or does not exist (${cwd}) — run 'npm run watch:pr -- ${prUrl}' manually from the worktree.`)
  process.exit(0)
}

const gitPath = resolve(worktreePath, '.git')
if (!existsSync(gitPath)) {
  reply(`spawn-pr-watcher: ${cwd}/.git not found — skipping watcher spawn.`)
  process.exit(0)
}

if (lstatSync(gitPath).isDirectory()) {
  // Main checkout — not a linked worktree, no watcher needed
  reply(`spawn-pr-watcher: PR ${prNumber} opened from main checkout (not a linked worktree) — no watcher needed.`)
  process.exit(0)
}

// Derive main repo root from the gitdir path in the .git file
const gitFileContent = readFileSync(gitPath, 'utf8').trim()
const gitdirPath = gitFileContent.replace('gitdir: ', '').trim()
// gitdirPath = /path/to/main/.git/worktrees/<name>
const mainRepoRoot = resolve(gitdirPath, '../../..')

// ─── Check if a watcher is already running for this worktree/PR ───────────
const watchDir = resolve(mainRepoRoot, '.git', 'watch-pr', prNumber)
const pidFile = resolve(watchDir, 'pid')

if (existsSync(pidFile)) {
  const existingPid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
  if (existingPid > 0) {
    try {
      process.kill(existingPid, 0)  // signal 0 = check if alive
      reply(`spawn-pr-watcher: Watcher already running for PR #${prNumber} (PID ${existingPid}). Kill it with: kill ${existingPid}`)
      process.exit(0)
    } catch {
      // PID not alive — stale file, proceed to spawn a fresh watcher
    }
  }
}

// ─── Spawn the detached watcher ────────────────────────────────────────────
const watcherScript = resolve(mainRepoRoot, 'scripts', 'watch-pr.mjs')
if (!existsSync(watcherScript)) {
  reply(`spawn-pr-watcher: ${watcherScript} not found — cannot spawn watcher.`)
  process.exit(0)
}

const child = spawn(
  process.execPath,
  [watcherScript, prUrl, worktreePath, mainRepoRoot],
  {
    detached: true,
    stdio: 'ignore',    // fully detached — no stdout/stderr pipes
    cwd: mainRepoRoot,
  }
)
child.unref()           // don't keep the hook process alive waiting for the child

reply(
  `PR #${prNumber} watcher started (PID ${child.pid}). ` +
  `The worktree at ${worktreePath} will be torn down automatically when the PR is merged. ` +
  `To cancel: kill ${child.pid}  |  Log: ${watchDir}/watcher.log`
)
