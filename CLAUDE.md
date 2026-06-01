# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WODalytics is a CrossFit workout tracking tool for gym members and trainers.

## Where guidance lives

This file covers cross-cutting topics — anything that spans the monorepo or applies to all apps. App-specific patterns (design systems, DB conventions, route handler style, mobile testing, etc.) live in per-app `CLAUDE.md` files and load automatically when you work in that subtree:

- `apps/api/CLAUDE.md` — DB manager pattern, route handler style (thin-wrapper mandate), error logging, background jobs, API integration tests.
- `apps/mcp/CLAUDE.md` — MCP tool handler style (thin-wrapper mandate), local testing, auth setup.
- `apps/web/CLAUDE.md` — design system (primitives, tokens, a11y, ARIA), unit + E2E testing patterns.
- `apps/mobile/CLAUDE.md` — mobile-only conventions; design system to be added when established.
- `packages/db/CLAUDE.md` — manager pattern, naming rules, what belongs in a manager vs. a caller.

**When adding new guidance:** put it in the most specific `CLAUDE.md` that owns it. If a rule only applies to web, it belongs in `apps/web/CLAUDE.md`. Promote to root only when the rule genuinely spans apps. Keeping per-app rules out of the root file keeps it short enough to actually be read.

## If you only read one section

- **Default to a worktree.** Each Claude session should start by creating a `git worktree` off `main` and working there, unless the user explicitly says to stay in the main checkout. See *Default workflow* below.
- **Open PRs without asking.** When work is shippable, push the branch and run `gh pr create` directly — share the URL for review rather than asking for permission first.
- **Worktree teardown is automatic via the PR watcher.** After `gh pr create` a background watcher starts automatically (via PostToolUse hook). It polls the PR every 3 minutes and tears down the worktree the moment it merges, releasing the branch lock. Do NOT manually tear down the worktree while the PR is open — it keeps your working copy available for review feedback. If the hook misses a PR or you need to watch a specific PR manually: `npm run watch:pr -- <pr-url>`.
- **PR review comments surface automatically.** While the watcher polls, it also pulls new review/inline/issue comments into `.git/watch-pr/<pr#>/inbox.jsonl`. SessionStart, UserPromptSubmit, and Stop hooks consume that file and inject unread comments into the next turn — no manual paste-in needed. To preview pending comments without consuming them: `npm run pr:inbox`.
- **Phone-suitable feature? Web AND mobile ship together — neither surface is primary, neither is a follow-up.** A phone-suitable feature is not done until both surfaces are merged. See *Parity-first feature design* below.
- **Working in a worktree?** Read *Worktree development* below — `npm run dev:worktree` is collision-resistant but the workflow has details worth knowing.
- **Touching the schema?** Read *Schema migrations* below — every schema PR must commit its migration file.
- **Opening a PR?** Read *Pull requests* below — the Tests section format is required.
- **Web work?** `apps/web/CLAUDE.md` — primitives before custom Tailwind.
- **API work?** `apps/api/CLAUDE.md` — DB manager pattern + thin-wrapper mandate are mandatory.
- **MCP work?** `apps/mcp/CLAUDE.md` — tool handlers are thin wrappers over DB managers; no inline Prisma.
- **DB manager work?** `packages/db/CLAUDE.md` — naming rules, what belongs here vs. in callers.

## Default workflow

These two defaults exist because the user runs N parallel Claude sessions and the friction of asking permission for routine actions adds up.

1. **Start in a worktree.** First action of any non-trivial task: `git worktree add .claude/worktrees/<branch> -b <branch> main` (or `git worktree add /tmp/<descriptive-name> -b <branch> main` if `.claude/worktrees/` isn't suitable). Do *not* work directly in the primary checkout. Reasons: parallel sessions don't step on each other's branches, the dev-stack ports auto-allocate per worktree (see below), and `git worktree remove` is the safe cleanup. Only stay in the primary checkout if the user explicitly says so.
2. **Open PRs without asking.** Once the branch is in a shippable state (tests pass, scope is complete), push it and call `gh pr create` directly. Share the resulting URL. The user reviews on GitHub, not in chat. This *does not* extend to destructive actions — force-push, branch deletion, merge — those still need explicit confirmation.
3. **Worktree teardown is automatic.** The PostToolUse hook (`scripts/hooks/spawn-pr-watcher.mjs`) fires automatically after every `gh pr create` call. It spawns a detached background daemon (`scripts/watch-pr.mjs`) that polls the PR every 3 minutes and runs `teardown:worktree` the moment the PR is merged. You do NOT need to manually tear down the worktree — leaving it alive during review is intentional so you can push fixup commits in response to review feedback. The watcher log is at `<main-repo>/.git/watch-pr/<pr-number>/watcher.log`. To cancel a watcher: `kill $(cat .git/watch-pr/<pr-number>/pid)`. To abandon a worktree without waiting for merge: `npm run teardown:worktree`.

## Parity-first feature design

WODalytics runs on both phones and desktops. For phone-suitable features, **web and mobile are co-equal surfaces** — there is no primary surface, no follow-up surface, and no acceptable parity debt. A feature that only landed on one surface is a half-shipped feature; it belongs in the backlog, not in "done." The right question when scoping a feature is not "who uses this?" but **"in what context will they use it?"** Roles cut across both surfaces — a coach making a last-minute workout fix on the class floor needs mobile just as much as a member logging a result.

**Surface choice follows task ergonomics, not user role:**

- **Phone-suitable tasks** — quick, in-the-moment, often hands-on while moving. Plan web + mobile siblings up front; both must ship to call the feature done. Examples: viewing today's WOD, logging a result, browsing the leaderboard, jotting a coach note on a member, fixing a typo or movement substitution on a workout 5 minutes before class, marking attendance, glancing at a member's recent results, editing your own profile.
- **Desk-suitable tasks** — heavy authoring, multi-step planning, dense data entry that benefits from a keyboard, mouse, and a larger screen. Web-first or web-only is fine. Examples: programming a full week of WODs from scratch, bulk CSV upload, the full-month calendar view, multi-row gym/member admin, gym branding setup, billing/Stripe configuration (when added), CSV exports.

The rule of thumb: if the task lives in someone's "I need this in the next 30 seconds" workflow, it belongs on mobile too — regardless of role. If it's a "block out an hour to plan" workflow, web-first or web-only is fine.

When in doubt, lean toward "phone-suitable." Being too aggressive about web-only is what produced the current parity drift. Some features have *both* shapes — e.g., editing a single workout's text is phone-suitable; authoring a brand-new workout with 8 movements from scratch is desk-suitable. Split them into separate sub-issues if the ergonomics differ that much.

If you can't decide which bucket a feature is in, ask the user before opening sub-issues.

**When opening a new feature issue / planning work:**

1. **Sub-issues are required for every surface, filed at the same time.** A phone-suitable feature must produce: an API sub-issue (if needed), a web sub-issue, AND a mobile sub-issue — all linked to the parent, all filed before any implementation starts. A feature with only one surface's sub-issue filed is not "in flight" — it is incomplete planning. Do not start implementing on any surface until both web and mobile sub-issues exist.
2. **Cross-app contracts go in `apps/web/CLAUDE.md` → *Cross-app contracts*** the moment a new persisted-state shape (localStorage key, query string, request/response field) is introduced for a phone-suitable feature, so the sibling surface can mirror it without re-deriving. The Program filter contract is the template.
3. **Every PR for a phone-suitable feature must include a "Surface coverage" line** in the Tests section. State which surfaces this PR covers, and link the sibling issue or PR for each surface it does not cover. This applies to web PRs and mobile PRs equally. The only valid alternative is "desk-suitable only — N/A on mobile/web" with a one-line rationale.

**Hard gate before opening any PR for a phone-suitable feature:**

Verify that a tracked issue or open PR exists for every surface this feature touches. If you're about to open a web PR and no mobile sub-issue exists (or vice versa), file it before or alongside this PR. Do not merge a one-surface PR without a tracked counterpart — that is the mechanism that creates parity debt.

## API + MCP planning heuristics

The API and MCP server are two transports over the same DB-manager layer. Every feature that exposes data or actions to a *member acting on their own data* is a candidate for both. Don't treat MCP as "follow-up work" — design the manager once, then ship API and MCP tools as siblings so an LLM client and a REST client see the same capabilities.

**When to file an MCP sub-issue alongside the API one:**

Ask three questions:

1. **Is the actor the member themselves?** If yes (reading their own data, creating their own data, modifying their own data) — MCP is in scope.
2. **Does the action need a coach/programmer/owner role to be useful?** If yes — *skip MCP for now*. Coach+ role gating isn't wired into the MCP tool layer yet (the `wodalytics_role` claim is in the JWT but tools don't check it). When that lands, revisit; until then, an MCP tool that exposes a coach action would either silently let any member do it or always 403.
3. **Is the read part of a public surface (leaderboards, named-workout catalog, public programs)?** If yes — MCP is in scope as a read tool, no role check needed.

**What's safe to expose today:**
- Public reads: leaderboards on gym/public workouts, the named-workout catalog, public programs.
- Member-scoped reads: my own results, my own goals, my own PRs, my own benchmark history, my own profile.
- Member-scoped writes: log my own result, set my own plan, create/update/delete my own goal, update my own profile.

**What requires coach/admin roles (defer until MCP role gating lands):**
- Reading another member's private data (results outside leaderboards, goals, plans).
- Writing on another member's behalf (set a plan, set a goal, edit profile).
- Editing programmed workouts (PROGRAMMER).
- Gym / program / billing admin (OWNER).

**Tool-naming convention for the MCP layer:**

- Reads scoped to the caller: `list_my_X`, `get_my_X`. The `my_` prefix makes the scope obvious in the tool description without forcing a user-ID parameter into the schema — the user is always resolved from the JWT.
- Writes scoped to the caller: `create_X`, `update_my_X`, `delete_my_X`, `log_X`, `set_my_X`. Verbs without `my_` are fine for create-only (you can only ever create *your own* X). Updates and deletes use `my_` to make the ownership constraint explicit in the name.
- Public reads keep neutral names: `get_workout_results`, `list_workouts`, `get_programs`.
- For polymorphic creates (one resource with several variants like a Goal), prefer **separate tools per variant** (`create_pr_target_goal`, `create_frequency_goal`, `create_habit_goal`) over one polymorphic `create_goal`. Each tool's argument schema can declare exactly the fields the variant requires, so the LLM picks the right tool by intent and never has to reason about cross-variant field combinations.

**Reuse, don't duplicate:**

MCP tool handlers are thin wrappers over the same `*DbManager` functions the API route handlers call. If you find yourself re-implementing logic that already exists in a route handler, the manager is missing a method — add it to `packages/db/src/managers/` first, then have both the route and the tool call into it. See `apps/mcp/CLAUDE.md` → *Thin-wrapper mandate* and `apps/api/CLAUDE.md` → *Thin-wrapper mandate*.

**Issue-breakdown hook:**

When the parent feature issue is filed for an API + UI feature that has a "my X" self-service shape, add an **MCP sub-issue** alongside the API/web/mobile ones. It depends on the API sub-issue (or stacks on its branch). Scope is usually small — a single tools file + tests, ~200–400 lines. The PR description should list each tool, its argument schema, and the manager function it delegates to.

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | React Native (Expo) |
| Web (admin) | Vite + React + TailwindCSS |
| API | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Auth | Custom JWT + Google OAuth |
| Monorepo | npm workspaces + Turborepo |
| Hosting | Railway |

## Railway QA environment

**Project:** WODalytics (`c218e9bc-d755-43de-a2b8-1f3e21b6c7e5`)
**Environment:** qa (`4f09cfd1-d6a9-4061-a0fa-f2eab81e46fe`)

| Service name | Service ID | What it is |
|---|---|---|
| WODalytics-API | `ffc25291-3c23-444a-b279-37f420f7638c` | Express API (apps/api) |
| WODalytics-web | `8bb8eecf-cb41-4d71-b9f7-7a6c088dca25` | Vite web app + nginx reverse proxy (apps/web) |
| WODalytics-DB | `a56c9848-42df-4b72-896f-1f147e82f91d` | Primary Postgres (app data) |
| WODalytics-Auth | `bfe642c5-1cd9-4369-853b-c01e50ec6d4a` | Keycloak auth server (infra/keycloak) |
| WODalytics-Auth-DB | `f79a42d3-35d2-47d6-93b3-0ecb561ab914` | Postgres for Keycloak only |
| WODalytics-MCP | `b9e68a94-b6cc-47a3-9df3-7404ee7adc39` | MCP server (apps/mcp) |
| Cron-CrossFit-Mainsite-WOD | `46549419-1ccc-4611-b68f-87824ddaf594` | CrossFit mainsite WOD ingestion job |
| CRON-Named-Workout | `b53196bc-8833-4b13-8079-61c1ff120b56` | Named workout import job |

**IDs to pass to Railway CLI/MCP tools:**
```bash
# Example: list variables on the API service
railway variable list --project c218e9bc-d755-43de-a2b8-1f3e21b6c7e5 \
  --environment qa --service ffc25291-3c23-444a-b279-37f420f7638c
```

## Monorepo structure

```
WODalytics/
├── apps/
│   ├── api/          # Express API (port 3000)
│   ├── web/          # Vite admin portal (port 5173)
│   └── mobile/       # Expo app
├── packages/
│   ├── db/           # Prisma schema + client (source of truth for data model)
│   └── types/        # Zod schemas shared across apps
├── package.json       # npm workspaces root
└── turbo.json
```

## Top-level commands

```bash
turbo dev             # start all apps concurrently (default ports: 3000 / 5173)
npm run dev:worktree         # worktree-aware dev — picks free ports, prints URLs, writes .dev-ports.local + .dev-pids.local
npm run dev:worktree:stop    # tear down THIS worktree's dev stack (PID + port-targeted; never affects siblings)
npm run setup:worktree       # idempotent first-run preflight (.env symlink, install, prisma generate, db:migrate); auto-run by dev:worktree
npm run dev:jobs -- <name>            # run a single API background job locally
npm run test:worktree -- api          # API integration tests against the worktree's dev stack
npm run test:worktree -- e2e [args]   # Playwright E2E against the worktree's dev stack
turbo build           # build all apps
turbo lint            # typecheck all workspaces (correct way to run tsc across the monorepo)
npm run db:migrate    # run Prisma migrations (uses root .env via dotenv-cli)
npm run db:studio     # open Prisma Studio
```

> **Note:** Do NOT run `npx tsc --noEmit` from the repo root. The root `tsconfig.json`
> is a base config (Node.js settings, no JSX) extended by each workspace. Running it
> at root will either error or apply the wrong settings to React files.
> Use `turbo lint` for all workspaces, or `npm run lint --workspace=<name>` for one.

App-specific test commands (single test, filter by name, etc.) live in each app's `CLAUDE.md`.

## Worktree development — running dev + tests in parallel

When working in a `git worktree` (e.g. `.claude/worktrees/<branch>`), the default fixed ports (API on 3000, web on 5173) collide with anything already running — the Docker `wodalytics-api` container, another worktree's dev stack, or a previous Claude session. **Use the worktree-aware scripts** so each worktree gets its own pair of ports and never blocks another.

### Workflow

1. **Start the dev stack inside the worktree:**
   ```bash
   npm run dev:worktree
   ```
   Picks random free API + web ports, writes `.dev-ports.local` + `.dev-pids.local`, spawns `dev:api` and `dev:web` with the right env, and self-heals if a parallel worktree collides on the same port. Full behavior, port ranges, and troubleshooting live in the script header — see `scripts/dev-worktree.mjs`. Ctrl-C tears both servers down cleanly in an interactive terminal; from a background / scripted context use the stop command (next section).

   **First-run setup is automatic.** `dev:worktree` runs `scripts/setup-worktree.mjs` as a preflight before spawning anything. That script idempotently handles the four things a fresh `git worktree add` checkout needs: symlinking the primary checkout's `.env`, `npm install`, `npx prisma generate`, and `npm run db:migrate`. Subsequent runs no-op fast. You can also invoke it directly via `npm run setup:worktree` (e.g. before `npm run test:worktree` from a worktree where you don't want the dev servers running).

2. **Run tests against that stack:**
   ```bash
   npm run test:worktree -- api
   npm run test:worktree -- e2e tests/programs.spec.ts
   ```
   `test:worktree` reads `.dev-ports.local` and propagates `API_URL` / `WEB_URL` into the existing test commands. No need to set env vars by hand.

3. **Manually invoke the underlying commands** (escape hatch — only when `test:worktree` doesn't fit). Note: `node -p require(...)` does **not** work on `.dev-ports.local` because the `.local` extension isn't registered for JSON. Read it explicitly:
   ```bash
   API_URL="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".dev-ports.local")).apiUrl + "/api")')" \
     npm run test --workspace=@wodalytics/api

   WEB_URL="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".dev-ports.local")).webUrl)')" \
     npm run test:e2e --workspace=@wodalytics/web -- tests/programs.spec.ts
   ```

### What Claude must do before saying "all tests pass"

Before reporting test success in a PR (especially for a slice or feature work), Claude **must**:

1. From the worktree, run `npm run dev:worktree` in the background and wait for both servers to bind.
2. Run **both** `npm run test:worktree -- api` and `npm run test:worktree -- e2e` against that stack.
3. Report the actual numbers (passed / failed / total) plus any flaky tests.
4. After opening the PR, the PostToolUse hook automatically spawns a background watcher that will tear down the worktree once the PR merges. You do NOT need to manually tear down — the worktree stays alive so you can push fixup commits during review. The watcher log is at `<main-repo>/.git/watch-pr/<pr-number>/watcher.log`.

Skipping the live test runs and falling back to "static checks only" — like the slice-1 / slice-2 PRs had to — is a regression that this workflow exists to prevent. If the worktree dev stack genuinely won't start (port conflict the helper can't resolve, DB unreachable), say so explicitly in the PR rather than papering over with "reviewer to verify".

### Worktree teardown — how it works

> **Hard rule: never use `pkill node`, `killall node`, or any other broad process kill.** Those kill sibling worktrees too.

> **Hard rule: never run `cd <path> && git <cmd>`.** The `cd` triggers Claude Code's "untrusted hooks" security prompt on every call. Use `git -C <path> <cmd>` instead — it runs git in the target directory without changing the shell's working directory, so no prompt fires. A PreToolUse hook enforces this and will block violating commands.

**Automatic (normal path):** The PostToolUse hook fires after `gh pr create` and spawns `scripts/watch-pr.mjs` as a detached background daemon. The daemon polls `gh pr view` every 3 minutes. On merge it runs:
1. `stop-worktree.mjs` — kills dev servers
2. `git worktree remove --force` — deregisters the worktree and deletes the directory
3. `git worktree prune` — cleans up any remaining stale entries

**Manual — abandon without waiting for merge:**
```bash
npm run teardown:worktree  # from inside the worktree
```
Stops dev stack + removes worktree immediately. Use this if the PR is being closed/abandoned, not merged.

**Manual — stop processes only (mid-session, not end-of-session):**
```bash
npm run dev:worktree:stop  # kills dev servers, leaves worktree registered
```

**Cancel the watcher for a specific PR:**
```bash
kill $(cat .git/watch-pr/<pr-number>/pid)
```

**Manual watch invocation (if hook missed a PR):**
```bash
npm run watch:pr -- <pr-url>  # from the worktree root
```

### Batch cleanup — removing stale worktrees

When many sessions have accumulated without teardown, run from the **main checkout** (not a worktree):

```bash
npm run prune:worktrees          # dry-run: shows what would be removed
npm run prune:worktrees -- --yes # actually remove merged worktrees
```

This reads `.git/worktrees/` metadata directly (fast, doesn't run `git worktree list`), checks which branches are merged into `origin/main`, removes those worktrees and their directories, and runs `git worktree prune` to clean entries for missing directories. Unmerged worktrees are listed but kept.

If you're unsure whether a stack is still running, check `.dev-pids.local` (presence + a live PID = running) before launching another. The orchestrator refuses to start a second instance over an existing live one.

### Env vars honored

| Var | Where | Default |
|---|---|---|
| `API_PORT` | `apps/api/src/index.ts` | `process.env.PORT ?? 3000` |
| `WEB_PORT` | `apps/web/vite.config.ts` (`server.port`) | `5173` |
| `API_PORT` | `apps/web/vite.config.ts` (`server.proxy.target`) | `3000` |
| `API_URL`  | `apps/api/tests/*.ts` (`BASE` constant) | `http://localhost:3000/api` |
| `WEB_URL`  | `apps/web/playwright.config.ts` (`baseURL`) | `http://localhost:5173` |

All defaults preserve historical single-stack behavior — running `npm run dev` (or `dev:api` / `dev:web` standalone) without these vars still binds to 3000 / 5173.

### N worktrees in parallel

Engineers (or Claude sessions) can run `npm run dev:worktree` in any number of worktrees concurrently — random port selection plus EADDRINUSE retry means collisions are rare and self-healing when they do happen. **The DB is still shared**, so be mindful of fixture-naming collisions in tests (#101 tracks the auth-state leak this can cause; #74 tracks per-worktree DB isolation).

## Developer onboarding

For first-time setup, follow `README.md` → *Getting started*. It covers Docker Desktop, the Postgres container, `.env` creation, `/etc/hosts` entries, Expo Go on a phone, and the common-error table.

Steps Claude can run automatically: `npm install`, `npm run db:migrate`, `npx prisma generate`, file edits, git operations. Steps that require the engineer: installing system tools (Homebrew, Docker Desktop, Node), copying `.env.example` → `.env`, editing `/etc/hosts` (needs sudo), installing Expo Go on a device.

### Local DB backups (macOS, one-time per machine)

The dev DB is a local Docker Postgres instance with no built-in backup. Set up hourly automated backups so a `prisma migrate dev` reset or other accident doesn't permanently lose dev data.

```bash
# 1. Create backup directory and deploy the script there
#    (LaunchAgents cannot execute scripts from ~/Documents — must live outside it)
mkdir -p ~/.wodalytics-backups
cp scripts/backup-local-db.sh ~/.wodalytics-backups/backup-local-db.sh
chmod +x ~/.wodalytics-backups/backup-local-db.sh

# 2. Install and start the LaunchAgent (survives reboots)
#    sed substitutes __HOME__ with your actual home directory
sed "s|__HOME__|$HOME|g" scripts/com.wodalytics.db-backup.plist \
  > ~/Library/LaunchAgents/com.wodalytics.db-backup.plist
launchctl load ~/Library/LaunchAgents/com.wodalytics.db-backup.plist
```

Backups land in `~/.wodalytics-backups/wodalytics_<timestamp>.sql.gz`. The last 48 are kept (~2 days). Logs at `~/.wodalytics-backups/backup.log`.

**To restore:**
```bash
gunzip -c ~/.wodalytics-backups/wodalytics_<timestamp>.sql.gz \
  | docker exec -i wodalytics-db psql -U postgres -d wodalytics
```

**To stop backups:**
```bash
launchctl unload ~/Library/LaunchAgents/com.wodalytics.db-backup.plist
```

## Architecture pointers

- **Source of truth for the data model:** `packages/db/prisma/schema.prisma`.
- **Shared types:** `packages/types/src/` — enums, API response shapes, and any type used by more than one of web/mobile/api belong here. See *Shared types rule* below.
- **Auth verification:** `apps/api/src/middleware/auth.ts` — single point for all routes.
- **Shared business logic layer:** `packages/db/src/managers/` — all Prisma access lives here; API routes, MCP tools, and background jobs call managers, never `prisma.*` directly. See `packages/db/CLAUDE.md`.
- **API REST conventions, DB managers, route handlers, jobs:** see `apps/api/CLAUDE.md`.
- **MCP tool handlers:** see `apps/mcp/CLAUDE.md`.
- **Web design system, primitives, a11y:** see `apps/web/CLAUDE.md`.

## Shared types rule

**Before defining a type in `apps/web/src/lib/api.ts` or `apps/mobile/src/lib/api.ts`, check `packages/types/src/` first.**

A type belongs in `packages/types` if it is:
- An enum value (role, status, category, PR type, etc.)
- A read-only API response shape used by web, mobile, or the API itself
- Anything referenced by more than one app

**Where to put it:**

| What | File |
|---|---|
| Auth / role enums | `auth.ts` |
| Workout enums / input schemas | `workout.ts` |
| Movement enums / input schemas | `movement.ts` |
| Read-only API response shapes (PR entries, history pages, benchmark results, named workouts) | `apiTypes.ts` |
| Result value shapes | `result.ts` |

After adding to the domain file, export from `index.ts`. The app-level `api.ts` files re-export from `@wodalytics/types` so existing import paths stay stable — add a `export type { ... }` line there rather than duplicating the definition.

**What stays app-local:** fetch wrappers (`api.xxx()` methods), response shapes that genuinely differ between surfaces (e.g. web's `WorkoutResult` vs mobile's `LeaderboardEntry`), and UI-only types with no cross-app consumer.

## Key enums

```prisma
enum Role          { OWNER, PROGRAMMER, COACH, MEMBER }
enum WorkoutType   { STRENGTH, FOR_TIME, EMOM, CARDIO, AMRAP, METCON, WARMUP }
enum WorkoutLevel  { RX_PLUS, RX, SCALED, MODIFIED }
enum WorkoutStatus { DRAFT, PUBLISHED }
enum Gender        { WOMAN, MAN, NON_BINARY, PREFER_NOT_TO_SAY }  // User.identifiedGender — nullable, self-identified
enum WorkoutGender { MALE, FEMALE, OPEN }                          // Result.workoutGender — required, leaderboard grouping
```

## Pull requests

When creating a PR, always link the relevant issue in the PR body using a GitHub closing keyword (e.g. `Closes #11`) or a plain reference (e.g. `Part of #11`) so that context is well linked. Use `Closes` when the PR fully resolves the issue; use `Part of` when it is one slice of a multi-PR issue.

### Testing section format

Every PR must include a **Tests** section that describes what was tested and how. This is not just a checkbox list for reviewers — it should tell the reader what test coverage exists and what the remaining manual verification surface is.

**Structure:**

```markdown
## Tests

**Unit** (`apps/web/src/pages/<Page>.test.tsx`):
- <what each test asserts — e.g. "renders without crashing", "shows movement chips">

**API integration** (`apps/api/tests/<file>.ts`):
- <what each case asserts — one bullet per meaningful assertion group>
- Auth guards (401 / 403) for all protected routes

**Playwright E2E** (`apps/web/tests/<file>.spec.ts`):
- T1: <test name and what it verifies>
- T2: ...

**Not automated / manual verification needed:**
- [ ] <Anything that genuinely cannot be driven by a test, e.g. visual polish, third-party OAuth, device-specific behavior>

**Surface coverage:** <"Covers web. Mobile: #NNN" | "Covers mobile. Web: #NNN" | "Covers web + mobile" | "Desk-suitable only — N/A on mobile/web: <one-line rationale>">
```

**Rules:**
- Every test that exists should be named and briefly described. Do not just list "9 tests" — list each one.
- Separate automated coverage from manual steps clearly. If a manual step can be automated, automate it first, then remove it from the manual list.
- If a behaviour is tested by an existing test suite (not new to this PR), note which file covers it rather than leaving it as an unchecked box.
- The manual checklist should be short. If it's more than 3–4 items, that is a sign more automation is needed.
- For PRs touching auth, role gates, or visibility rules: always call out which roles were tested and how.
- **For any PR that touches a phone-suitable surface (web or mobile):** include a `**Surface coverage:**` line in the body. State which surfaces this PR covers, and link the sibling issue or PR for every surface it does not cover (`#NNN`). If the feature is desk-suitable only, state "desk-suitable only — N/A on mobile/web" with a one-line rationale (e.g. "month-grid calendar relies on a wide viewport"). This rule applies equally to web PRs and mobile PRs — it is not a web-only obligation.

### Schema migrations — required pre-merge checklist item

Every PR that modifies `packages/db/prisma/schema.prisma` **must** commit the generated migration file before merging:

```bash
npm run db:migrate   # generates packages/db/prisma/migrations/<timestamp>_<name>/migration.sql
git add packages/db/prisma/migrations/
git commit -m "chore(db): add migration for <description>"
```

**Why this matters:** Prisma migration files are the source of truth for schema history. If a migration is applied to a dev database without committing the file, other developers and production deployments will see drift errors and may need to run `prisma migrate reset --force` (which destroys all data). Always commit migration files as part of the PR that introduced the schema change — never after.

### Isolate migration PRs — ship small, ship fast

Identify schema migrations at planning time and split them into their own tiny, backwards-compatible PRs that land ahead of feature work.

**Why this matters:** Parallel branches that each modify the Prisma schema don't conflict in git (different timestamped migration files), but the SQL can conflict at `migrate deploy` time, or a later migration can depend on state that was rebased away. The longer a schema-touching branch lives, the bigger the conflict surface — and in QA/prod the blast radius is data loss, not just merge friction.

**How to apply:**
- At issue-breakdown time, call out every schema change as its own sub-issue.
- Make the migration **additive** where possible — new nullable columns, new tables, no destructive `DROP` / incompatible `ALTER`. This keeps old code against the new schema, and new code against the old schema, both functional, decoupling the migration merge from the code merge.
- Ship the migration PR first and let it deploy, then ship the feature PR that reads/writes the new columns.
- If two engineers both need to touch the same model, coordinate so one lands first; the second rebases, deletes their local migration folder, re-runs `prisma migrate dev` against the updated schema, and commits the regenerated migration with a fresh timestamp.

### API response shape changes — expand-contract pattern

Railway deploys the API and web as independent services. There is always a window — sometimes minutes — where one service is ahead of the other. A breaking API response shape change (renaming a field, changing a flat field to an array, etc.) will crash whichever surface is deployed first while it talks to the service that hasn't been updated yet.

**Rule: never make a breaking response shape change in a single PR.** Use the expand-contract pattern instead:

1. **PR 1 — Expand:** Ship the API change that adds the *new* fields alongside the *old* ones. The response carries both shapes simultaneously. No frontend change in this PR. Safe to deploy in any order.
2. **PR 2 — Migrate:** Update the frontend to read the new fields. By the time this deploys, the new API is everywhere, so the new web never sees the old shape.
3. **PR 3 — Contract:** Remove the old fields from the API and clean up the types.

Steps 2 and 3 can often be combined if the deploy window is tightly controlled, but step 1 must always land and deploy first.

**Defensive frontend is still required.** Even with expand-contract in place, always use optional chaining (`data.workouts?.length`) on API response fields rather than assuming the shape is exact. This guards against: the window before step 1 deploys, a stale browser tab, and unexpected edge cases in the API.

**Detecting the pattern:** if you're changing the type signature of a field that already exists in a response used by a deployed frontend — you need expand-contract. Adding a *new* optional field that nothing reads yet is safe. Renaming, changing structure, or making a previously-optional field required are all breaking.

## Issue sizing and breakdown strategy

When breaking a large feature issue into sub-issues for implementation:

- **PR size target:** 250–500 lines of production code per PR. Unit tests may push a PR over this limit — that is acceptable.
- **Break by domain:** Each sub-issue covers one domain (e.g., backend API, web UI, mobile UI). Do not mix backend and frontend changes in the same PR unless trivially small.
- **Phone-suitable features need both a web sub-issue AND a mobile sub-issue, period — filed at the same time, before any implementation starts.** Neither surface is the primary; neither is the follow-up. Desk-suitable features (heavy authoring, dense admin) can be web-only. See *Parity-first feature design* above for the boundary.
- **One PR per sub-issue:** Each sub-issue should map to exactly one pull request.
- **Declare dependencies explicitly:** Note which sub-issues must land first. Safe parallel starting points should be identified so multiple engineers (or AI slices) can work concurrently.
- **Reuse before building:** Before proposing new utilities or abstractions, search for existing patterns (DB managers, middleware, Zod schemas, API client methods) that can be extended.
- **Schema migrations travel with their PR:** Any sub-issue that modifies the Prisma schema must commit the generated migration file as part of that PR (see *Schema migrations* above).
