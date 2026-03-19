# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BernTracker is a CrossFit workout tracking tool for gym members and trainers.

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | React Native (Expo) |
| Web (admin) | Vite + React + TailwindCSS |
| API | Node.js + Express + TypeScript |
| Database | PostgreSQL via Prisma ORM |
| Auth | Custom JWT + Google OAuth |
| Monorepo | npm workspaces + Turborepo |
| Hosting | TBD (Railway or Render) |

## Monorepo structure

```
BernTracker/
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

## Commands

```bash
turbo dev          # start all apps concurrently
turbo build        # build all apps
turbo lint         # typecheck all workspaces (correct way to run tsc across the monorepo)
npm run db:migrate # run Prisma migrations (uses root .env via dotenv-cli)
npm run db:studio  # open Prisma Studio
```

> **Note:** Do NOT run `npx tsc --noEmit` from the repo root. The root `tsconfig.json`
> is a base config (Node.js settings, no JSX) extended by each workspace. Running it
> at root will either error or apply the wrong settings to React files.
> Use `turbo lint` for all workspaces, or `npm run lint --workspace=<name>` for one.

## Developer onboarding

When an engineer asks for help setting up the project, use the README Getting Started section as the guide. Some steps can be run automatically via tools; others require manual action from the engineer.

### Steps Claude CAN run automatically
- `npm install` — install all workspace dependencies
- `npm run db:migrate` — run migrations (once Docker + DB are running)
- `npx prisma generate` — regenerate the Prisma client after schema changes
- `npx tsc --noEmit` — typecheck any package
- `git` operations, file creation, edits

### Steps that require manual action from the engineer
- Installing Homebrew, Node.js, Git, or Docker Desktop — requires system-level install
- **Starting Docker Desktop** — must be opened as a GUI app before any `docker` commands work; if the engineer sees `dial unix /var/run/docker.sock: no such file or directory`, Docker Desktop is not running
- **Running `docker run --name berntracker-db ...`** — creates the Postgres container; only needed once. On subsequent sessions: `docker start berntracker-db`
- **Copying `.env.example` → `.env`** — file contains secrets and must be created manually
- Installing Expo Go on a physical device

### Common setup errors and fixes
| Error | Cause | Fix |
|---|---|---|
| `dial unix /var/run/docker.sock: no such file or directory` | Docker Desktop not running | Open Docker Desktop and wait for it to start |
| `Unable to find image 'berntracker-db:latest'` | Ran `docker run berntracker-db` instead of the full command | Run the full `docker run` command with `postgres:16` as the image |
| `P1001: Can't reach database server at localhost:5432` | Postgres container not running | `docker start berntracker-db` |
| `Environment variable not found: DATABASE_URL` | `.env` file missing | `cp .env.example .env` from repo root |
| `command not found: turbo` | Dependencies not installed | `npm install` from repo root |
| `ConfigError: The expected package.json path: .../apps/mobile/package.json does not exist` | `expo start` run from repo root, or `npm install` not run after adding mobile workspace | Run from `apps/mobile`: `cd apps/mobile && npx expo start`. If new workspace was added, run `npm install` from root first to register the symlink. |

## Architecture

- API style: REST (see #8 for REST vs GraphQL analysis)
- Auth middleware: `apps/api/src/middleware/auth.ts` — single verification point for all routes
- Data model source of truth: `packages/db/prisma/schema.prisma`
- Shared result value types: `packages/types/src/result.ts`

### DB manager pattern

All Prisma queries must live in model-specific manager files under `apps/api/src/db/`, not inline in route handlers. One file per Prisma model (or logical model group):

```
apps/api/src/db/
  gymDbManager.ts          # prisma.gym.*
  userGymDbManager.ts      # prisma.userGym.* (memberships)
  gymProgramDbManager.ts   # prisma.gymProgram.* + prisma.program.create
  userProgramDbManager.ts  # prisma.userProgram.* (subscriptions)
```

**Naming rules:**
- File: `<model>DbManager.ts` (camelCase, matches the Prisma model name)
- Functions: verbose and descriptive — name what the query does, not just what it calls
  - ✅ `findMembersWithProgramSubscriptionsByGymId(gymId)`
  - ✅ `createGymAndAddOwnerMember(data, ownerId)`
  - ❌ `getMembers(gymId)` — too vague
  - ❌ `userGymFindMany(gymId)` — just restates the Prisma call

Route handlers should read like high-level orchestration — guard clauses, call managers, return responses — with no raw `prisma.*` calls.

### Route handler style

Route handlers must be extracted into **named async functions** — do not pass inline lambdas directly to `router.get/post/patch/delete`. Named handlers make the router registration self-documenting.

```typescript
// ✅ Good — router reads like a table of contents
async function getWorkoutsByGymAndDateRange(req: Request, res: Response) { ... }
router.get('/gyms/:gymId/workouts', requireAuth, requireGymMembership, getWorkoutsByGymAndDateRange)

// ❌ Avoid — logic buried in registration call
router.get('/gyms/:gymId/workouts', requireAuth, async (req, res) => { ... })
```

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

### Schema migrations — required pre-merge checklist item

Every PR that modifies `packages/db/prisma/schema.prisma` **must** commit the generated migration file before merging:

```bash
npm run db:migrate   # generates packages/db/prisma/migrations/<timestamp>_<name>/migration.sql
git add packages/db/prisma/migrations/
git commit -m "chore(db): add migration for <description>"
```

**Why this matters:** Prisma migration files are the source of truth for schema history. If a migration is applied to a dev database without committing the file, other developers and production deployments will see drift errors and may need to run `prisma migrate reset --force` (which destroys all data). Always commit migration files as part of the PR that introduced the schema change — never after.

## Issue sizing and breakdown strategy

When breaking a large feature issue into sub-issues for implementation:

- **PR size target:** 250–500 lines of production code per PR. Unit tests may push a PR over this limit — that is acceptable.
- **Break by domain:** Each sub-issue covers one domain (e.g., backend API, web UI, mobile UI). Do not mix backend and frontend changes in the same PR unless trivially small.
- **One PR per sub-issue:** Each sub-issue should map to exactly one pull request.
- **Declare dependencies explicitly:** Note which sub-issues must land first. Safe parallel starting points should be identified so multiple engineers (or AI slices) can work concurrently.
- **Reuse before building:** Before proposing new utilities or abstractions, search for existing patterns (DB managers, middleware, Zod schemas, API client methods) that can be extended.
- **Schema migrations travel with their PR:** Any sub-issue that modifies the Prisma schema must commit the generated migration file as part of that PR (see Schema migrations section above).

## Issue index

See the comment on #1 for the full navigation hub.

| # | Purpose |
|---|---|
| #1 | Parent issue |
| #2 | Competitor research |
| #7 | Wireframes |
| #8 | Architecture & data model |
| #9 | Google OAuth setup |
| #10 | Slice 1 — Foundation |
| #11 | Slice 2 — Auth |
| #12 | Slice 3 — Gyms + users |
| #13 | Slice 4 — Workout publishing |
| #14 | Slice 5 — Member mobile |
| #35 | #13-A — Workout CRUD & Publish API |
| #36 | #13-B — Result & Leaderboard API |
| #37 | #13-C — Trainer Web: Calendar Page |
| #38 | #13-D — Trainer Web: Workout Drawer |
| #39 | #13-E — Member Mobile: Navigation + Feed + WOD Detail |
| #40 | #13-F — Member Mobile: Result Logging + History |
