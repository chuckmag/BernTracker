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

### API error logging conventions

Use `console.log("")` (not `console.error`) to log diagnostic information. Log at every auth/authorization failure point and whenever catching an unexpected exception, so that issues are easy to trace in the server output.

**Auth failures** — include the HTTP method, path, and relevant context:
```typescript
console.log(`[auth] requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
console.log(`[auth] requireRole: access denied — ${req.method} ${req.path} — userId=${req.user?.id} role=${req.user?.role} required=${roles.join('|')}`)
```

**Unexpected exceptions in route handlers** — include the path and the error:
```typescript
console.log(`[error] ${req.method} ${req.path} — ${err instanceof Error ? err.message : err}`, err)
```

The global error-handling middleware in `apps/api/src/index.ts` automatically logs and returns 500 for any uncaught exception thrown from a route handler — route handlers should `throw` rather than swallow errors they cannot handle.

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

## Testing

### API integration tests

Located in `apps/api/tests/`. Each file is a self-contained TypeScript script that:
- Seeds all fixtures directly via Prisma (no HTTP for setup)
- Signs JWT tokens in-process via `signTokenPair` from `../src/lib/jwt.js`
- Drives assertions through the live API using `fetch()`
- Cleans up all created data in a `finally` block

**Run:**
```bash
npm run test --workspace=@berntracker/api
# or from apps/api:
cd apps/api && npx dotenv-cli -e ../../.env -- sh -c 'for f in tests/*.ts; do npx tsx "$f" || exit 1; done'
```

**Requires:** API running on `localhost:3000`, DB accessible via `DATABASE_URL`.

**Adding a new test file:** Follow the pattern in any existing file. Add the new script to the `test` command in `apps/api/package.json`.

---

### Web unit tests (Vitest + React Testing Library)

Located in `apps/web/src/**/*.test.tsx`. Each test file lives next to the component it covers.

**Run:**
```bash
npm run test:unit --workspace=@berntracker/web
# or from apps/web:
cd apps/web && npx vitest run
```

**Requires:** nothing running — fully in-process, no server or DB needed.

**Setup:** Vitest is configured in `vite.config.ts` (`test.environment: 'jsdom'`). The global setup file `src/test/setup.ts` imports `@testing-library/jest-dom` matchers. Vitest globals (`describe`, `it`, `expect`, `vi`) are enabled so no imports are needed in test files.

**When to write unit tests vs E2E:**
- Unit tests cover **component rendering and logic**: does the page render without crashing? Are the right elements shown given a mocked API response? Use `vi.mock('../lib/api')` to control API responses.
- E2E tests (Playwright) cover **user flows end-to-end**: navigation, real API calls, DB state. Use E2E when the correctness depends on the full stack.
- **Every page must have at least one render test** that asserts it mounts without throwing. This catches crashes from type mismatches, missing fields, or bad assumptions about API shape — bugs that would otherwise only surface in the browser.

**Patterns to follow:**
- Wrap the component in `<MemoryRouter>` with `<Routes>` matching the real URL pattern so `useParams` works.
- Mock `../lib/api` fully — every `api.*` call used by the component must be mocked or the test will hang.
- Mock `../context/AuthContext` to return a minimal `{ user: { id, name } }`.
- Use `screen.findBy*` (async) for elements that appear after a resolved promise.

---

### Web E2E tests (Playwright)

Located in `apps/web/tests/`. Each spec file uses Playwright and seeds DB fixtures directly via `PrismaClient` (imported via `createRequire` to bypass ESM/CJS issues).

**Run:**
```bash
npm run test --workspace=@berntracker/web   # runs unit tests first, then E2E
npm run test:e2e --workspace=@berntracker/web  # E2E only
# or from apps/web:
cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test
```

**Requires:** `turbo dev` running (API on `:3000`, web on `:5173`).

**Patterns to follow:**
- Use `test.describe.configure({ mode: 'serial' })` — tests share seeded DB state.
- Use `test.beforeAll` / `test.afterAll` with Prisma for setup/teardown.
- Seed directly via Prisma (not via API) to keep setup fast and independent of API state.
- Assign one isolated day or entity per test to avoid cross-test interference.
- `gymId` must be set in `localStorage` before navigating to gym-scoped pages (pages read it on mount).
- Import PrismaClient via `createRequire(import.meta.url)` — do not use ESM named imports from `@prisma/client`.

---

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
| #46 | #13-G — Trainer Web: Multiple Workouts on a Single Day |
| #48 | #13-H — Member Web: Feed + WOD Detail |
| #49 | #13-I — Member Web: Result Logging + History |
