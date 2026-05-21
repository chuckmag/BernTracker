#!/usr/bin/env node
/**
 * pr-inbox.mjs — Pretty-print the watcher's inbox.jsonl for the current
 * worktree's PR. Useful for debugging when hooks aren't surfacing comments.
 *
 *   npm run pr:inbox          # current worktree's PR
 *   npm run pr:inbox -- <#>   # explicit PR number
 *
 * Reads <main-repo>/.git/watch-pr/<pr#>/inbox.jsonl. Does not consume entries
 * (does not touch read.json) — purely a viewer.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'

function fail(msg) {
  process.stderr.write(`[pr-inbox] ${msg}\n`)
  process.exit(1)
}

function detectMainRepo(cwd) {
  const gitPath = resolve(cwd, '.git')
  if (!existsSync(gitPath)) fail(`No .git found at ${cwd}.`)
  if (lstatSync(gitPath).isDirectory()) return cwd  // main checkout
  const gitdir = readFileSync(gitPath, 'utf8').trim().replace('gitdir: ', '').trim()
  return resolve(gitdir, '../../..')
}

function detectPrNumber(cwd) {
  const result = spawnSync('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
    cwd, encoding: 'utf8', timeout: 10_000,
  })
  if (result.status !== 0) fail(`gh pr view failed: ${result.stderr.trim()}`)
  const n = result.stdout.trim()
  if (!n) fail('No PR detected for this worktree. Pass an explicit PR number.')
  return n
}

const argPr = process.argv[2]
const cwd = process.cwd()
const mainRepoRoot = detectMainRepo(cwd)
const prNumber = argPr || detectPrNumber(cwd)

const inboxFile = resolve(mainRepoRoot, '.git', 'watch-pr', prNumber, 'inbox.jsonl')
if (!existsSync(inboxFile)) {
  process.stdout.write(`No inbox file at ${inboxFile} — watcher may not have polled yet.\n`)
  process.exit(0)
}

const lines = readFileSync(inboxFile, 'utf8').trim().split('\n').filter(Boolean)
if (lines.length === 0) {
  process.stdout.write('Inbox is empty.\n')
  process.exit(0)
}

process.stdout.write(`PR #${prNumber} — ${lines.length} entr${lines.length === 1 ? 'y' : 'ies'}\n\n`)
for (const line of lines) {
  let e
  try { e = JSON.parse(line) } catch { continue }
  const loc = e.path ? ` ${e.path}${e.line ? `:${e.line}` : ''}` : ''
  const state = e.state ? ` [${e.state}]` : ''
  process.stdout.write(`• ${e.ts}  ${e.kind}${state}  @${e.author}${loc}\n`)
  process.stdout.write(`  ${e.body.replace(/\n/g, '\n  ').slice(0, 400)}\n`)
  if (e.url) process.stdout.write(`  ${e.url}\n`)
  process.stdout.write('\n')
}
