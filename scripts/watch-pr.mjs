#!/usr/bin/env node
/**
 * watch-pr.mjs — Background daemon that watches a GitHub PR. Two jobs:
 *   1. Tear down the linked worktree when the PR is merged.
 *   2. Pull new review/issue/inline comments and append them to an inbox file
 *      that local Claude Code hooks read on session boundaries.
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
 *   OPEN    → poll every POLL_INTERVAL_MS (state + new comments)
 *   MERGED  → stop dev servers + git worktree remove → exit 0
 *   CLOSED  → log "closed without merge, keeping worktree" → exit 0
 *   Timeout → exit after MAX_AGE_DAYS
 *
 * State files written to <main-repo>/.git/watch-pr/<pr-number>/:
 *   pid         — this process's PID (kill it to cancel watching)
 *   watcher.log — timestamped activity log
 *   seen.json   — IDs of feedback entries already pulled (so restarts don't replay)
 *   inbox.jsonl — append-only stream of new comments for the local Claude hooks
 *
 * Env:
 *   WODALYTICS_PR_NOTIFY=1 — fire a macOS notification for each new comment
 */
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, lstatSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseRepoFromPrUrl,
  normalizeFeedback,
  diffNew,
  mergeSeen,
} from './lib/pr-feedback.mjs'

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
const seenFile = resolve(watchDir, 'seen.json')
const inboxFile = resolve(watchDir, 'inbox.jsonl')

function log(msg) {
  const line = `${new Date().toISOString()}  ${msg}\n`
  process.stdout.write(line)
  appendFileSync(logFile, line)
}

// ─── Feedback fetch + diff ─────────────────────────────────────────────────
const repo = parseRepoFromPrUrl(prUrl)
if (!repo) log(`Could not parse owner/repo from URL "${prUrl}" — comment polling disabled.`)

function loadSeen() {
  if (!existsSync(seenFile)) return null
  try {
    return JSON.parse(readFileSync(seenFile, 'utf8'))
  } catch (err) {
    log(`seen.json unreadable (${err.message}) — treating as first run.`)
    return null
  }
}

function fetchFeedback() {
  if (!repo) return null
  // Two calls: gh pr view covers comments+reviews, gh api covers inline review comments.
  const view = spawnSync(
    'gh',
    ['pr', 'view', prUrl, '--json', 'comments,reviews'],
    { encoding: 'utf8', timeout: 30_000 },
  )
  if (view.status !== 0) {
    log(`gh pr view --json comments,reviews failed (exit ${view.status}): ${(view.stderr || '').trim()}`)
    return null
  }
  let viewJson
  try {
    viewJson = JSON.parse(view.stdout || '{}')
  } catch (err) {
    log(`Could not parse gh pr view JSON: ${err.message}`)
    return null
  }

  const inline = spawnSync(
    'gh',
    ['api', `repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/comments`, '--paginate'],
    { encoding: 'utf8', timeout: 30_000 },
  )
  let reviewComments = []
  if (inline.status === 0 && inline.stdout.trim()) {
    try {
      // --paginate concatenates JSON arrays with no separator; ungroup with a regex split.
      // Easiest robust parse: replace `][` with `,` so it forms one array.
      const merged = inline.stdout.replace(/\]\s*\[/g, ',')
      reviewComments = JSON.parse(merged)
    } catch (err) {
      log(`Could not parse inline review comments JSON: ${err.message}`)
    }
  } else if (inline.status !== 0) {
    log(`gh api inline comments failed (exit ${inline.status}): ${(inline.stderr || '').trim()}`)
  }

  return normalizeFeedback({
    issueComments: viewJson.comments ?? [],
    reviews: viewJson.reviews ?? [],
    reviewComments,
  })
}

function notify(entry) {
  if (process.env.WODALYTICS_PR_NOTIFY !== '1') return
  if (process.platform !== 'darwin') return
  const titleSafe = `PR #${prNumber} — ${entry.author}`.replace(/"/g, '\\"')
  const previewSafe = entry.body.slice(0, 120).replace(/[\n"]/g, ' ')
  spawnSync(
    'osascript',
    ['-e', `display notification "${previewSafe}" with title "${titleSafe}"`],
    { timeout: 3_000 },
  )
}

function pollFeedback() {
  if (!repo) return
  const current = fetchFeedback()
  if (!current) return  // failure already logged

  const seen = loadSeen()
  if (seen === null) {
    // Seed mode — record everything currently on the PR without replaying.
    const seeded = mergeSeen({}, current)
    writeFileSync(seenFile, JSON.stringify(seeded, null, 2) + '\n')
    log(`Seeded seen.json with ${current.length} existing entries (no replay).`)
    return
  }

  const fresh = diffNew(current, seen)
  if (fresh.length === 0) return

  log(`PR #${prNumber}: ${fresh.length} new comment(s).`)
  for (const entry of fresh) {
    appendFileSync(inboxFile, JSON.stringify(entry) + '\n')
    notify(entry)
  }
  const nextSeen = mergeSeen(seen, fresh)
  writeFileSync(seenFile, JSON.stringify(nextSeen, null, 2) + '\n')
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

  // Pull new comments while the PR is open. Wrapped in try/catch so a
  // transient gh failure never takes down the teardown watcher.
  try {
    pollFeedback()
  } catch (err) {
    log(`pollFeedback threw: ${err.stack ?? err.message}`)
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
