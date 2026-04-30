# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WODalytics is a CrossFit workout tracking tool for gym members and trainers.

## Where guidance lives

This file covers cross-cutting topics — anything that spans the monorepo or applies to all apps. App-specific patterns (design systems, DB conventions, route handler style, mobile testing, etc.) live in per-app `CLAUDE.md` files and load automatically when you work in that subtree:

- `apps/api/CLAUDE.md` — DB manager pattern, route handler style, error logging, background jobs, API integration tests.
- `apps/web/CLAUDE.md` — design system (primitives, tokens, a11y, ARIA), unit + E2E testing patterns.
- `apps/mobile/CLAUDE.md` — mobile-only conventions; design system to be added when established.

**When adding new guidance:** put it in the most specific `CLAUDE.md` that owns it. If a rule only applies to web, it belongs in `apps/web/CLAUDE.md`. Promote to root only when the rule genuinely spans apps. Keeping per-app rules out of the root file keeps it short enough to actually be read.

## If you only read one section

- **Default to a worktree.** Each Claude session should start by creating a `git worktree` off `main` and working there, unless the user explicitly says to stay in the main checkout. See *Default workflow* below.
- **Open PRs without asking.** When work is shippable, push the branch and run `gh pr create` directly — share the URL for review rather than asking for permission first.
- **Working in a worktree?** Read *Worktree development* below — `npm run dev:worktree` is collision-resistant but the workflow has details worth knowing.
- **Touching the schema?** Read *Schema migrations* below — every schema PR must commit its migration file.
- **Opening a PR?** Read *Pull requests* below — the Tests section format is required.
- **Web work?** `apps/web/CLAUDE.md` — primitives before custom Tailwind.
- **API work?** `apps/api/CLAUDE.md` — DB manager pattern is mandatory.

## Default workflow

These two defaults exist because the user runs N parallel Claude sessions and the friction of asking permission for routine actions adds up.

1. **Start in a worktree.** First action of any non-trivial task: `git worktree add .claude/worktrees/<branch> -b <branch> main` (or `git worktree add /tmp/<descriptive-name> -b <branch> main` if `.claude/worktrees/` isn't suitable). Do *not* work directly in the primary checkout. Reasons: parallel sessions don't step on each other's branches, the dev-stack ports auto-allocate per worktree (see below), and `git worktree remove` is the safe cleanup. Only stay in the primary checkout if the user explicitly says so.
2. **Open PRs without asking.** Once the branch is in a shippable state (tests pass, scope is complete), push it and call `gh pr create` directly. Share the resulting URL. The user reviews on GitHub, not in chat. This *does not* extend to destructive actions — force-push, branch deletion, merge — those still need explicit confirmation.

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
npm run dev:worktree  # worktree-aware dev — picks free ports, prints URLs, writes .dev-ports.local
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
   Picks random free API + web ports, writes `.dev-ports.local`, spawns `dev:api` and `dev:web` with the right env, and self-heals if a parallel worktree collides on the same port. Full behavior, port ranges, and troubleshooting live in the script header — see `scripts/dev-worktree.mjs`. Ctrl-C tears both servers down cleanly.

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
4. Tear the dev stack down (`kill` the bg PIDs) before opening the PR.

Skipping the live test runs and falling back to "static checks only" — like the slice-1 / slice-2 PRs had to — is a regression that this workflow exists to prevent. If the worktree dev stack genuinely won't start (port conflict the helper can't resolve, DB unreachable), say so explicitly in the PR rather than papering over with "reviewer to verify".

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

## Architecture pointers

- **Source of truth for the data model:** `packages/db/prisma/schema.prisma`.
- **Shared result value types:** `packages/types/src/result.ts`.
- **Auth verification:** `apps/api/src/middleware/auth.ts` — single point for all routes.
- **API REST conventions, DB managers, route handlers, jobs:** see `apps/api/CLAUDE.md`.
- **Web design system, primitives, a11y:** see `apps/web/CLAUDE.md`.

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
```

**Rules:**
- Every test that exists should be named and briefly described. Do not just list "9 tests" — list each one.
- Separate automated coverage from manual steps clearly. If a manual step can be automated, automate it first, then remove it from the manual list.
- If a behaviour is tested by an existing test suite (not new to this PR), note which file covers it rather than leaving it as an unchecked box.
- The manual checklist should be short. If it's more than 3–4 items, that is a sign more automation is needed.
- For PRs touching auth, role gates, or visibility rules: always call out which roles were tested and how.

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

## Issue sizing and breakdown strategy

When breaking a large feature issue into sub-issues for implementation:

- **PR size target:** 250–500 lines of production code per PR. Unit tests may push a PR over this limit — that is acceptable.
- **Break by domain:** Each sub-issue covers one domain (e.g., backend API, web UI, mobile UI). Do not mix backend and frontend changes in the same PR unless trivially small.
- **One PR per sub-issue:** Each sub-issue should map to exactly one pull request.
- **Declare dependencies explicitly:** Note which sub-issues must land first. Safe parallel starting points should be identified so multiple engineers (or AI slices) can work concurrently.
- **Reuse before building:** Before proposing new utilities or abstractions, search for existing patterns (DB managers, middleware, Zod schemas, API client methods) that can be extended.
- **Schema migrations travel with their PR:** Any sub-issue that modifies the Prisma schema must commit the generated migration file as part of that PR (see *Schema migrations* above).
