#!/usr/bin/env node
/**
 * SessionStart / UserPromptSubmit / Stop hook — surface new PR review
 * comments from `.git/watch-pr/<pr#>/inbox.jsonl` into the Claude Code
 * session as `additionalContext`. The companion daemon `scripts/watch-pr.mjs`
 * is responsible for populating the inbox; this hook only consumes it.
 *
 * Registered in `.claude/settings.json` under all three events with the same
 * command. The script auto-detects which event it's running under from the
 * hook JSON and tags its reply accordingly.
 *
 * Lifecycle per invocation:
 *   1. Read hook JSON from stdin (`{ hook_event_name, cwd, ... }`).
 *   2. Detect the worktree's PR via `gh pr view --json number`.
 *   3. Read inbox.jsonl, compare against `read.json`.
 *   4. Emit unread entries as `additionalContext`.
 *   5. Append the surfaced IDs to `read.json` so the next turn doesn't replay.
 *
 * Hard rule: the hook MUST exit 0 in every error path. A crashing hook
 * confuses Claude Code and surfaces ugly tracebacks in the session — the
 * worst-case behavior of this script is "no comments surfaced," never a
 * broken session.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { filterUnread, formatContext, mergeRead } from './lib/inbox-reader.mjs'

function reply(hookEventName, additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName, additionalContext },
  }) + '\n')
}

// ─── Parse hook context ────────────────────────────────────────────────────
let raw = ''
try {
  for await (const chunk of process.stdin) raw += chunk
} catch {
  process.exit(0)
}

let ctx
try {
  ctx = JSON.parse(raw)
} catch {
  process.exit(0)
}

// Claude Code uses snake_case in the stdin payload; the reply expects camelCase.
const hookEventName = ctx.hook_event_name ?? ctx.hookEventName ?? 'SessionStart'
const cwd = ctx.cwd ?? process.cwd()

// ─── Find main repo root (worktree-aware) ──────────────────────────────────
const gitPath = resolve(cwd, '.git')
if (!existsSync(gitPath)) process.exit(0)

let mainRepoRoot = cwd
if (!lstatSync(gitPath).isDirectory()) {
  // Linked worktree — `.git` is a file containing `gitdir: <path>`.
  try {
    const gitFileContent = readFileSync(gitPath, 'utf8').trim()
    const gitdirPath = gitFileContent.replace('gitdir: ', '').trim()
    mainRepoRoot = resolve(gitdirPath, '../../..')
  } catch {
    process.exit(0)
  }
}

// ─── Detect PR for this worktree ───────────────────────────────────────────
const view = spawnSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
  cwd, encoding: 'utf8', timeout: 5_000,
})
if (view.status !== 0) process.exit(0)
const prNumber = view.stdout.trim()
if (!prNumber) process.exit(0)

// ─── Load inbox + read state ───────────────────────────────────────────────
const watchDir = resolve(mainRepoRoot, '.git', 'watch-pr', prNumber)
const inboxFile = resolve(watchDir, 'inbox.jsonl')
const readFile = resolve(watchDir, 'read.json')

if (!existsSync(inboxFile)) process.exit(0)

let entries = []
try {
  const lines = readFileSync(inboxFile, 'utf8').split('\n').filter(Boolean)
  for (const line of lines) {
    try { entries.push(JSON.parse(line)) } catch { /* skip malformed line */ }
  }
} catch {
  process.exit(0)
}

let readState = { ids: [] }
if (existsSync(readFile)) {
  try {
    readState = JSON.parse(readFileSync(readFile, 'utf8'))
  } catch {
    // Treat unreadable read.json as empty — we'll overwrite it below.
  }
}

// ─── Filter + surface + persist ────────────────────────────────────────────
const unread = filterUnread(entries, new Set(readState.ids ?? []))
if (unread.length === 0) process.exit(0)

const context = formatContext(unread)
const nextRead = mergeRead(readState, unread)

try {
  writeFileSync(readFile, JSON.stringify(nextRead, null, 2) + '\n')
} catch {
  // If we can't persist read state, still surface this turn — better to
  // show a comment twice than to never show it. The next successful write
  // will deduplicate.
}

reply(hookEventName, context)
