#!/usr/bin/env node
/**
 * PreToolUse hook — blocks Bash commands that combine `cd <path> && git`.
 * That pattern triggers Claude Code's "untrusted hooks" security prompt on
 * every invocation. The fix is always `git -C <path> <cmd>`.
 *
 * Registered in .claude/settings.json:
 *   { "hooks": { "PreToolUse": [{ "matcher": "Bash",
 *       "hooks": [{ "type": "command",
 *                   "command": "node scripts/hooks/no-cd-git.mjs" }] }] } }
 *
 * Claude Code passes tool context as JSON on stdin:
 *   { tool_name, tool_input: { command }, cwd }
 */

// In GitHub Actions the project hooks are loaded from origin/main into a
// non-worktree CI checkout. The `cd <path> && git` lint is for the local
// session ergonomics — blocking review-agent bash calls here only wastes
// its turn budget.
if (process.env.GITHUB_ACTIONS === 'true') process.exit(0)

let raw = ''
for await (const chunk of process.stdin) raw += chunk

let ctx
try {
  ctx = JSON.parse(raw)
} catch {
  process.exit(0)
}

const command = ctx?.tool_input?.command ?? ''

// Match: cd <anything> && git  (with optional whitespace variants)
if (/\bcd\s+\S+.*&&\s*git\b/.test(command)) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: [
        'Blocked: `cd <path> && git` triggers the "untrusted hooks" security prompt on every call.',
        '',
        'Use `git -C <path> <cmd>` instead — same effect, no prompt:',
        '',
        '  WRONG:  cd /some/worktree && git diff --stat',
        '  RIGHT:  git -C /some/worktree diff --stat',
        '',
        'The -C flag runs git in the target directory without changing the shell cwd.',
      ].join('\n'),
    })
  )
}
