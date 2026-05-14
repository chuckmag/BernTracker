#!/usr/bin/env node
/**
 * PreToolUse hook — blocks Edit and Write calls that target files inside the
 * main git checkout (where .git is a directory). Enforces the project policy
 * that all code edits happen inside a linked git worktree.
 *
 * Registered in .claude/settings.json:
 *   { "hooks": { "PreToolUse": [{ "matcher": "Edit|Write",
 *       "hooks": [{ "type": "command",
 *                   "command": "node scripts/hooks/require-worktree.mjs" }] }] } }
 *
 * Claude Code passes tool context as JSON on stdin:
 *   { tool_name, tool_input: { file_path }, cwd }
 *
 * The hook returns JSON with decision: "block" to prevent the edit, or exits
 * cleanly (no output) to allow it.
 *
 * BYPASS: For legitimate main-checkout edits (migrations, one-off fixes,
 * cross-cutting files like CLAUDE.md or scripts/), create an ephemeral marker
 * file using the Bash tool (which is never blocked):
 *
 *   touch .worktree-bypass     ← create bypass
 *   rm .worktree-bypass        ← delete when done
 *
 * The file is gitignored so it won't be accidentally committed.
 */
import { existsSync, lstatSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// ─── Read hook context from stdin ──────────────────────────────────────────
let raw = ''
for await (const chunk of process.stdin) raw += chunk

let ctx
try {
  ctx = JSON.parse(raw)
} catch {
  process.exit(0)
}

const filePath = ctx?.tool_input?.file_path

// No file_path in input — shouldn't happen for Edit/Write, but allow it
if (!filePath) process.exit(0)

// ─── Walk up from file_path to find the nearest .git entry ─────────────────
function findGitRoot(startPath) {
  let dir = dirname(resolve(startPath))
  const root = dirname(dir) // filesystem root sentinel
  while (dir !== root) {
    const gitPath = resolve(dir, '.git')
    if (existsSync(gitPath)) {
      return { repoRoot: dir, isWorktree: lstatSync(gitPath).isFile() }
    }
    dir = dirname(dir)
  }
  return null
}

const gitInfo = findGitRoot(filePath)

// Not in any git repo — allow (unusual, but don't block)
if (!gitInfo) process.exit(0)

// In a linked worktree (.git is a file) — allow
if (gitInfo.isWorktree) process.exit(0)

// In the main checkout (.git is a directory) — check for bypass marker
const bypassPath = resolve(gitInfo.repoRoot, '.worktree-bypass')
if (existsSync(bypassPath)) process.exit(0)

// ─── Block and explain ─────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason: [
      'Blocked: file edit targets the main git checkout.',
      '',
      'Per project policy, all code edits must happen inside a git worktree.',
      'Create one now (the dev stack and test runner are worktree-aware):',
      '',
      '  git worktree add .claude/worktrees/<branch-name> -b <branch-name> main',
      '',
      'Then work from that directory.',
      '',
      'EXCEPTION — for migrations, one-off fixes, or cross-cutting files',
      '(CLAUDE.md, scripts/, .claude/settings.json), create a bypass:',
      '',
      `  touch ${gitInfo.repoRoot}/.worktree-bypass   # allow main-checkout edits`,
      `  rm    ${gitInfo.repoRoot}/.worktree-bypass   # clean up when done`,
      '',
      'The bypass file is gitignored and ephemeral.',
    ].join('\n'),
  })
)
