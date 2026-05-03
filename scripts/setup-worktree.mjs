#!/usr/bin/env node
/**
 * Worktree first-run preflight.
 *
 * A fresh `git worktree add` checkout has no `.env`, no `node_modules`, and
 * its DB schema may have drifted from `main`. Without these four steps,
 * `npm run dev:worktree` fails with a string of confusing errors:
 *
 *   - missing .env  →  `node: ../../.env: not found`
 *   - missing node_modules / unbuilt Prisma client  →
 *     `@prisma/client did not initialize yet`
 *   - missing migrations  →
 *     `PrismaClientValidationError: Unknown argument 'sourceUrl'`
 *
 * `dev:worktree` runs this script automatically as a preflight (see
 * `scripts/dev-worktree.mjs`). It is also exposed as `npm run setup:worktree`
 * for direct invocation — useful before `npm run test:worktree` against a
 * worktree where you don't want to keep dev servers running, or as a
 * one-shot recovery after `npm install` or schema churn on `main`.
 *
 * Each step is **idempotent** — already-done work is detected and skipped:
 *
 *   1. .env: symlinked from the primary checkout if absent. Found via
 *      `git rev-parse --git-common-dir`, which from inside a worktree
 *      points at the primary's `.git/`.
 *   2. node_modules: `npm install` if the directory is missing. (We do
 *      not detect package.json drift after first install — re-run
 *      `npm install` manually if you bump deps in another worktree and
 *      pull them in here.)
 *   3. Prisma client: `npx prisma generate` always. ~3s when up to date,
 *      ~10s on first build. Run unconditionally so the client matches the
 *      worktree's `schema.prisma` after any merge that bumped it.
 *   4. DB migrations: `npx prisma migrate deploy` always. Applies any
 *      migration files in `packages/db/prisma/migrations/` that aren't in
 *      `_prisma_migrations` yet. Tolerates drift: if a sibling worktree's
 *      branch landed migrations on the shared DB that this worktree's
 *      `migrations/` folder doesn't have, deploy ignores them — its only
 *      job is "apply what I have." That's the right behavior for a setup
 *      preflight; engineers actively *authoring* a migration should use
 *      `npm run db:migrate` (i.e. `prisma migrate dev`) directly, which
 *      surfaces drift instead of tolerating it.
 *
 * The shared dev DB is intentional (see CLAUDE.md → *N worktrees in
 * parallel*). Migrations applied from one worktree are visible to all.
 *
 * Exit codes:
 *   0  — every step succeeded (or was a no-op)
 *   1  — a step failed; the offending command's output is forwarded to
 *        stderr so the operator can see what went wrong
 */
import { spawnSync } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()

function logStep(label) {
  console.log(`\x1b[36m[setup:worktree]\x1b[0m ${label}`)
}

function runOrExit(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root })
  if (result.status !== 0) {
    console.error(`\x1b[31m[setup:worktree]\x1b[0m \`${cmd} ${args.join(' ')}\` exited with ${result.status}`)
    process.exit(1)
  }
}

// ─── Step 1: .env symlink ─────────────────────────────────────────────────────
const envPath = resolve(root, '.env')
if (existsSync(envPath)) {
  logStep('.env present — skip')
} else {
  // `git rev-parse --git-common-dir` resolves to the primary checkout's `.git`
  // directory regardless of which worktree we're in. Its parent is the primary
  // checkout root, where the canonical `.env` lives.
  const gitCommon = spawnSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (gitCommon.status !== 0 || !gitCommon.stdout.trim()) {
    console.error('\x1b[31m[setup:worktree]\x1b[0m not in a git checkout — cannot resolve primary .env')
    process.exit(1)
  }
  const primaryEnv = resolve(dirname(gitCommon.stdout.trim()), '.env')
  if (!existsSync(primaryEnv)) {
    console.error(`\x1b[31m[setup:worktree]\x1b[0m primary checkout has no .env at ${primaryEnv}`)
    console.error('\x1b[31m[setup:worktree]\x1b[0m copy .env.example → .env in the primary checkout first')
    process.exit(1)
  }
  symlinkSync(primaryEnv, envPath)
  logStep(`.env → symlinked to ${primaryEnv}`)
}

// ─── Step 2: node_modules / npm install ───────────────────────────────────────
if (existsSync(resolve(root, 'node_modules'))) {
  logStep('node_modules present — skip install')
} else {
  logStep('node_modules missing — running `npm install` (this may take a minute)')
  runOrExit('npm', ['install'])
}

// ─── Step 3: Prisma client generate ───────────────────────────────────────────
// Always regenerate so the client matches the worktree's schema.prisma after
// any merge that bumped it. Cheap (~3s up to date, ~10s first build).
logStep('regenerating Prisma client (`npx prisma generate`)')
runOrExit('npx', ['prisma', 'generate', '--schema=packages/db/prisma/schema.prisma'])

// ─── Step 4: DB migrations (deploy, not dev) ──────────────────────────────────
// `migrate deploy` applies migration files from `packages/db/prisma/migrations/`
// that aren't yet in the `_prisma_migrations` table. It does NOT check for
// drift, which is the point: a sibling worktree's WIP migrations might be on
// the shared dev DB without being in this worktree's migrations/ folder, and
// `migrate dev` would refuse to proceed. Engineers authoring a fresh
// migration should run `npm run db:migrate` directly — that path uses
// `migrate dev` and surfaces drift correctly.
logStep('applying pending DB migrations (`prisma migrate deploy`)')
runOrExit('npx', [
  'dotenv-cli',
  '-e', '.env',
  '--',
  'npx', 'prisma', 'migrate', 'deploy',
  '--schema=packages/db/prisma/schema.prisma',
])

logStep('ready — `npm run dev:worktree` will succeed')
