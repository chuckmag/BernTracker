#!/usr/bin/env node
/**
 * End-of-session cleanup for a linked git worktree.
 *
 * Run this from inside the worktree when the session is done (PR opened,
 * work abandoned, etc.). It does two things that `npm run dev:worktree:stop`
 * alone does NOT do:
 *
 *   1. Stops this worktree's dev stack (delegates to stop-worktree.mjs).
 *   2. Removes the worktree from git (`git worktree remove --force`), which
 *      releases the branch lock so GitHub Desktop / git branch -d can delete
 *      the branch once it's merged.
 *
 * Without step 2, the branch stays locked and git complains:
 *   "error: cannot delete branch 'X' used by worktree at '/path'"
 *
 * Usage (from inside the worktree):
 *   npm run teardown:worktree
 *
 * The main checkout (.claude/worktrees/ parent) is detected automatically
 * via `git rev-parse --git-common-dir`. This script is safe to run from
 * any worktree created by `git worktree add`.
 *
 * WARNING: this deletes the worktree directory. Commit or stash any
 * unsaved work first.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')  // This is the worktree root when run from within it

// Safety: refuse to tear down the main checkout.
const commonDirResult = spawnSync('git', ['rev-parse', '--git-common-dir'], {
  cwd: root,
  encoding: 'utf8',
})
const gitCommonDir = commonDirResult.stdout.trim()
const gitDirResult = spawnSync('git', ['rev-parse', '--git-dir'], {
  cwd: root,
  encoding: 'utf8',
})
const gitDir = gitDirResult.stdout.trim()

// In the main checkout, --git-dir and --git-common-dir both resolve to .git
// In a linked worktree, --git-dir is .git/worktrees/<name> and --git-common-dir is the main .git
const isMainCheckout = resolve(root, gitDir) === resolve(root, gitCommonDir)
if (isMainCheckout) {
  console.error('[teardown:worktree] ERROR: This is the main checkout, not a linked worktree.')
  console.error('[teardown:worktree] teardown:worktree is only for linked worktrees under .claude/worktrees/.')
  console.error('[teardown:worktree] Use npm run dev:worktree:stop to stop the dev stack in the main checkout.')
  process.exit(1)
}

// Step 1: stop dev servers (idempotent — safe if nothing is running)
console.log('[teardown:worktree] Stopping dev stack...')
const stopResult = spawnSync(
  process.execPath,
  [resolve(here, 'stop-worktree.mjs')],
  { cwd: root, stdio: 'inherit' },
)
if (stopResult.status !== 0) {
  console.warn(`[teardown:worktree] stop-worktree exited with ${stopResult.status} — continuing anyway`)
}

// Step 2: remove the worktree. Run from the main repo root so git can find
// the registration entry.
const mainRepoRoot = resolve(root, gitCommonDir, '..')
const worktreePath = root

console.log(`[teardown:worktree] Removing worktree at ${worktreePath}`)
if (!existsSync(worktreePath)) {
  console.log('[teardown:worktree] Directory already gone — nothing to remove.')
  process.exit(0)
}

const removeResult = spawnSync(
  'git',
  ['worktree', 'remove', '--force', worktreePath],
  { cwd: mainRepoRoot, encoding: 'utf8', stdio: 'inherit' },
)

if (removeResult.status !== 0) {
  console.error('[teardown:worktree] git worktree remove failed — see output above.')
  console.error('[teardown:worktree] You can retry manually:')
  console.error(`  git worktree remove --force "${worktreePath}"`)
  process.exit(1)
}

console.log('[teardown:worktree] Done. Worktree deregistered and directory removed.')
console.log('[teardown:worktree] The branch lock is released — you can now delete the branch in GitHub Desktop or via:')
const branchResult = spawnSync('git', ['branch', '--show-current'], { cwd: mainRepoRoot, encoding: 'utf8' })
// We can't show the removed branch from the removed worktree, but we can hint
console.log('  git branch -d <branch-name>')
