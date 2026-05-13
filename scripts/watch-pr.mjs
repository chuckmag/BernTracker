#!/usr/bin/env node
/**
 * watch-pr.mjs — Background daemon that watches a GitHub PR and tears down
 * the linked worktree when the PR is merged.
 *
 * Spawned automatically by the PostToolUse hook (scripts/hooks/spawn-pr-watcher.mjs)
 * after `gh pr create` runs in a linked worktree. Can also be invoked manually:
 *
 *   npm run watch:pr -- <pr-url>
 *   node scripts/watch-pr.mjs <pr-url> [worktree-path] [main-repo-root]
 *
 * When worktree-path / main-repo-root are omitted the script auto-detects them
 * from the current working directory (must be a linked worktree).
 *
 * Lifecycle:
 *   OPEN    → poll every POLL_INTERVAL_MS
 *   MERGED  → stop dev servers + git worktree remove → exit 0
 *   CLOSED  → log "closed without merge, keeping worktree" → exit 0
 *   Timeout → exit after MAX_AGE_DAYS
 *
 * State files written to <main-repo>/.git/watch-pr/<pr-number>/:
 *   pid         — this process's PID (kill it to cancel watching)
 *   watcher.log — timestamped activity log
 */
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, lstatSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Args / auto-detect ────────────────────────────────────────────────────
const prUrl = process.argv[2]
if (!prUrl || !prUrl.includes('github.com')) {
  console.error('[watch-pr] Usage: node scripts/watch-pr.mjs <github-pr-url> [worktree-path] [main-repo-root]')
  process.exit(1)
}

const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1]
if (!prNumber) {
  console.error(`[watch-pr] Could not parse PR number from URL: ${prUrl}`)
  process.exit(1)
}

function detectFromGitFile(dir) {
  const gitPath = resolve(dir, '.git')
  if (!existsSync(gitPath)) return null
  if (lstatSync(gitPath).isDirectory()) return null  // main checkout, not a worktree

  const content = readFileSync(gitPath, 'utf8').trim()
  // content: "gitdir: /path/to/main/.git/worktrees/<name>"
  const gitdirPath = content.replace('gitdir: ', '').trim()
  // main repo root is two levels above .git/worktrees/<name>
  const mainGitDir = resolve(gitdirPath, '../..')  // .git/
  const mainRepoRoot = resolve(mainGitDir, '..')
  return { worktreePath: dir, mainRepoRoot }
}

let worktreePath = process.argv[3] || null
let mainRepoRoot = process.argv[4] || null

if (!worktreePath || !mainRepoRoot) {
  const detected = detectFromGitFile(process.cwd())
  if (!detected) {
    console.error('[watch-pr] Not in a linked worktree and no worktree-path/main-repo-root args given.')
    process.exit(1)
  }
  worktreePath = worktreePath || detected.worktreePath
  mainRepoRoot = mainRepoRoot || detected.mainRepoRoot
}

// ─── State directory ───────────────────────────────────────────────────────
const watchDir = resolve(mainRepoRoot, '.git', 'watch-pr', prNumber)
mkdirSync(watchDir, { recursive: true })
writeFileSync(resolve(watchDir, 'pid'), String(process.pid) + '\n')
writeFileSync(resolve(watchDir, 'worktree'), worktreePath + '\n')

const logFile = resolve(watchDir, 'watcher.log')

function log(msg) {
  const line = `${new Date().toISOString()}  ${msg}\n`
  process.stdout.write(line)
  appendFileSync(logFile, line)
}

// ─── Config ────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3 * 60 * 1000  // 3 minutes
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000  // 30 days
const startedAt = Date.now()

log(`Watching PR ${prNumber} (${prUrl})`)
log(`Worktree: ${worktreePath}`)
log(`Main repo: ${mainRepoRoot}`)
log(`PID: ${process.pid}  Kill this to cancel: kill ${process.pid}`)

// ─── Teardown ──────────────────────────────────────────────────────────────
function teardown() {
  log('PR merged — tearing down worktree...')

  if (existsSync(worktreePath)) {
    // Stop dev servers if running (idempotent)
    const stopScript = resolve(mainRepoRoot, 'scripts', 'stop-worktree.mjs')
    if (existsSync(stopScript)) {
      log('Stopping dev stack...')
      const stop = spawnSync(process.execPath, [stopScript], {
        cwd: worktreePath,
        encoding: 'utf8',
        timeout: 10_000,
      })
      if (stop.status !== 0) log(`stop-worktree exited ${stop.status} — continuing`)
    }

    // Remove the worktree
    log(`Running: git worktree remove --force ${worktreePath}`)
    const rm = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: mainRepoRoot,
      encoding: 'utf8',
    })
    if (rm.status === 0) {
      log('Worktree removed. Branch lock released.')
    } else {
      log(`git worktree remove failed (exit ${rm.status}): ${rm.stderr.trim()}`)
      log('You can remove it manually: git worktree remove --force ' + worktreePath)
    }

    // Prune stale entries
    spawnSync('git', ['worktree', 'prune'], { cwd: mainRepoRoot })
  } else {
    log('Worktree directory already gone — nothing to remove.')
  }

  // Clean up our PID file
  try { writeFileSync(resolve(watchDir, 'pid'), '') } catch {}
  log('Done.')
}

// ─── Poll loop ─────────────────────────────────────────────────────────────
async function checkPr() {
  const result = spawnSync('gh', ['pr', 'view', prUrl, '--json', 'state,mergedAt', '--jq', '.state'], {
    encoding: 'utf8',
    timeout: 30_000,
  })

  if (result.status !== 0 || !result.stdout.trim()) {
    log(`gh pr view failed (exit ${result.status}) — will retry. stderr: ${(result.stderr || '').trim()}`)
    return 'UNKNOWN'
  }

  return result.stdout.trim().replace(/"/g, '')  // "MERGED" → MERGED
}

async function poll() {
  const state = await checkPr()
  log(`PR #${prNumber} state: ${state}`)

  if (state === 'MERGED') {
    teardown()
    process.exit(0)
  }

  if (state === 'CLOSED') {
    log('PR closed without merging. Worktree left intact — clean it up manually when ready.')
    process.exit(0)
  }

  if (Date.now() - startedAt > MAX_AGE_MS) {
    log(`Watcher exceeded ${MAX_AGE_MS / 86400000} days. Exiting without teardown.`)
    process.exit(0)
  }
}

// Initial check immediately, then on interval
poll().then(() => {
  const timer = setInterval(poll, POLL_INTERVAL_MS)
  timer.unref()  // don't keep the process alive if nothing else is running

  process.on('SIGTERM', () => {
    log('Received SIGTERM — exiting without teardown.')
    process.exit(0)
  })
  process.on('SIGINT', () => {
    log('Received SIGINT — exiting without teardown.')
    process.exit(0)
  })
})
