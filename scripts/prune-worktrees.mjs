#!/usr/bin/env node
/**
 * Prunes stale git worktrees under .claude/worktrees/.
 *
 * Reads .git/worktrees/ metadata directly — much faster than `git worktree
 * list`, which blocks on all 78 entries. For each registered worktree:
 *
 *   - Directory no longer exists → collected for `git worktree prune`
 *   - Branch merged into main    → removed (worktree dir deleted)
 *   - Branch not merged          → kept, listed for manual review
 *
 * Usage:
 *   node scripts/prune-worktrees.mjs               # dry-run, prints plan
 *   node scripts/prune-worktrees.mjs --yes          # actually remove
 *   node scripts/prune-worktrees.mjs --yes --delete-branches  # also drop local branches
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const worktreesMetaDir = resolve(repoRoot, '.git/worktrees')
const isDryRun = !process.argv.includes('--yes')
const deleteBranches = process.argv.includes('--delete-branches')

if (isDryRun) {
  console.log('[prune-worktrees] DRY RUN — pass --yes to actually remove\n')
}

// All registered worktree entries (one sub-dir per registered linked worktree).
const entries = readdirSync(worktreesMetaDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)

// Build a set of local branches that are fully merged into origin/main.
// Using origin/main (remote tracking ref) rather than local main so that
// branches merged via GitHub PRs are detected even when the local main
// branch hasn't been pulled yet.
const mergedResult = spawnSync('git', ['branch', '--merged', 'origin/main'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
// Strip leading decoration chars: '* ' (current branch) or '+ ' (checked out
// in another worktree) or plain leading spaces. Any of these can prefix a
// branch name in `git branch` output.
const mergedBranches = new Set(
  (mergedResult.stdout || '')
    .split('\n')
    .map((b) => b.replace(/^[*+ ]+/, '').trim())
    .filter(Boolean),
)

const toRemove = []   // { entry, worktreePath, branch }
const toKeep = []     // same shape
let missingDirCount = 0

for (const entry of entries) {
  const entryDir = resolve(worktreesMetaDir, entry)

  // Branch: read from HEAD file (e.g. "ref: refs/heads/feat/my-feature")
  let branch = null
  try {
    const head = readFileSync(resolve(entryDir, 'HEAD'), 'utf8').trim()
    if (head.startsWith('ref: refs/heads/')) {
      branch = head.replace('ref: refs/heads/', '')
    }
  } catch {
    // unreadable — leave branch null
  }

  // Worktree root: gitdir contains path to <worktree>/.git, so parent = root
  let worktreePath = null
  try {
    const gitdirContent = readFileSync(resolve(entryDir, 'gitdir'), 'utf8').trim()
    worktreePath = dirname(gitdirContent)
  } catch {
    // unreadable — will be pruned
  }

  if (!worktreePath || !existsSync(worktreePath)) {
    missingDirCount++
    continue // git worktree prune handles these
  }

  if (branch && mergedBranches.has(branch)) {
    toRemove.push({ entry, worktreePath, branch })
  } else {
    toKeep.push({ entry, worktreePath, branch })
  }
}

// Execute removals
if (!isDryRun) {
  for (const { worktreePath, branch } of toRemove) {
    const result = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      console.error(`  ERROR removing ${worktreePath}:\n  ${result.stderr.trim()}`)
    } else if (deleteBranches && branch) {
      spawnSync('git', ['branch', '-d', branch], { cwd: repoRoot, encoding: 'utf8' })
    }
  }
  // Prune entries whose directories are already gone
  spawnSync('git', ['worktree', 'prune'], { cwd: repoRoot })
}

// Summary
console.log(`Registered worktrees : ${entries.length}`)
console.log(`Missing dirs (pruned): ${missingDirCount}`)
console.log(`Merged → ${isDryRun ? 'would remove' : 'removed'}: ${toRemove.length}`)
console.log(`Unmerged (kept)      : ${toKeep.length}`)
console.log()

if (toRemove.length > 0) {
  console.log(`${isDryRun ? 'Would remove' : 'Removed'} (branch merged into main):`)
  for (const { worktreePath, branch } of toRemove) {
    console.log(`  ${(branch ?? '(detached)').padEnd(55)} ${worktreePath}`)
  }
  console.log()
}

if (toKeep.length > 0) {
  console.log('Kept (unmerged — review manually):')
  for (const { worktreePath, branch } of toKeep) {
    console.log(`  ${(branch ?? '(detached)').padEnd(55)} ${worktreePath}`)
  }
}
