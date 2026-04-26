# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WODalytics is a CrossFit workout tracking tool for gym members and trainers.

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

## Commands

```bash
turbo dev             # start all apps concurrently (default ports: 3000 / 5173)
npm run dev:worktree  # worktree-aware dev — picks free ports, prints URLs, writes .dev-ports.local
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

## Worktree development — running dev + tests in parallel

When working in a `git worktree` (e.g. `.claude/worktrees/<branch>`), the default fixed ports (API on 3000, web on 5173) collide with anything already running — the Docker `wodalytics-api` container, another worktree's dev stack, or a previous Claude session. **Use the worktree-aware scripts** so each worktree gets its own pair of ports and never blocks another.

### Workflow

1. **Start the dev stack inside the worktree:**
   ```bash
   npm run dev:worktree
   ```
   - Picks two free ports (one in the 3001–3100 range, one in 5174–5273 — defaults 3000 / 5173 are reserved for non-worktree `turbo dev`), logs them, and writes `.dev-ports.local` (gitignored) at the worktree root.
   - Spawns `dev:api` with `API_PORT=<api>` and `dev:web` with `WEB_PORT=<web>`. Vite's proxy reads `API_PORT` so the browser hits the right backend.
   - Output is interleaved with `[api]` / `[web]` prefixes. Ctrl-C tears both down cleanly.

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

### Two worktrees in parallel

Engineers (or Claude sessions) can run `npm run dev:worktree` in two separate worktrees concurrently. Each picks its own pair of free ports — no collision. **The DB is still shared**, so be mindful of fixture-naming collisions in tests (#101 tracks the auth-state leak this can cause; #74 tracks per-worktree DB isolation).

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
- **Running `docker run --name wodalytics-db ...`** — creates the Postgres container; only needed once. On subsequent sessions: `docker start wodalytics-db`
- **Copying `.env.example` → `.env`** — file contains secrets and must be created manually
- **Adding local DNS entries** — append to `/etc/hosts` so browser requests to the containerised stack resolve to the local nginx proxy. Requires `sudo`:
  ```bash
  echo "127.0.0.1 local.wodalytics.com db-studio.local.wodalytics.com" | sudo tee -a /etc/hosts
  ```
  Once set, `docker compose up --build` exposes:
  - Web: `http://local.wodalytics.com`
  - API: `http://local.wodalytics.com/api/*` (same origin as web, no CORS)
  - Prisma Studio: `http://db-studio.local.wodalytics.com`
- Installing Expo Go on a physical device

### Common setup errors and fixes
| Error | Cause | Fix |
|---|---|---|
| `dial unix /var/run/docker.sock: no such file or directory` | Docker Desktop not running | Open Docker Desktop and wait for it to start |
| `Unable to find image 'wodalytics-db:latest'` | Ran `docker run wodalytics-db` instead of the full command | Run the full `docker run` command with `postgres:16` as the image |
| `P1001: Can't reach database server at localhost:5432` | Postgres container not running | `docker start wodalytics-db` |
| `Environment variable not found: DATABASE_URL` | `.env` file missing | `cp .env.example .env` from repo root |
| `command not found: turbo` | Dependencies not installed | `npm install` from repo root |
| `ConfigError: The expected package.json path: .../apps/mobile/package.json does not exist` | `expo start` run from repo root, or `npm install` not run after adding mobile workspace | Run from `apps/mobile`: `cd apps/mobile && npx expo start`. If new workspace was added, run `npm install` from root first to register the symlink. |
| `DNS_PROBE_FINISHED_NXDOMAIN` / `This site can't be reached` for `local.wodalytics.com` | `/etc/hosts` entries missing | Add the `127.0.0.1 local.wodalytics.com db-studio.local.wodalytics.com` entry to `/etc/hosts` (see manual steps above) |
| `Bind for 0.0.0.0:80 failed: port is already allocated` | Port 80 in use by another process | Stop the conflicting process, or change the proxy `ports:` in `docker-compose.yml` from `80:80` to `8080:80` (URLs become `local.wodalytics.com:8080`) |

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

### Background jobs

One-shot scripts triggered on a schedule live under `apps/api/src/jobs/`. The dispatcher at `apps/api/src/jobs/index.ts` is the CLI entrypoint — it takes the job name as `argv[2]`, looks it up in the `JOBS` map, runs the matching handler, disconnects Prisma, and exits (`0` on success, `1` on handler error, `2` on unknown / missing job name).

Each job is its own Railway service: same image (`apps/api/Dockerfile.jobs`), different `startCommand` (the job name), different `cronSchedule`. The image's `ENTRYPOINT` runs the dispatcher, so Railway only needs to override the argument.

**Adding a new job:**
1. Create `apps/api/src/jobs/<name>.ts` exporting an async handler.
2. Register it in the dispatcher's `JOBS` map in `src/jobs/index.ts`.
3. Add a `railway.<name>.toml` (or update `railway.jobs.toml`) with the desired `startCommand` and `cronSchedule`.

**Local invocation:** `npm run build --workspace=@wodalytics/api && npm run job --workspace=@wodalytics/api -- <name>`.

The Express API service does **not** import job code at runtime — the two services share modules under `src/lib/` and `src/db/`, but have separate entrypoints and separate Railway deployments. A job failure cannot affect the user-facing API.
## Design system (web)

Established by #81. **Always use existing primitives before writing custom Tailwind for the same pattern.** Look here first; only inline styles when the primitive genuinely doesn't fit.

### Primitives — `apps/web/src/components/ui/`

| Primitive | When to use | Notes |
|---|---|---|
| `Button` | Every clickable action button | Variants: `primary` (indigo, the default CTA), `secondary` (gray, less weight), `tertiary` (text-only, e.g. pagination/back-arrows), `destructive` (rose, delete actions). Includes the shared focus ring — never bake your own focus styles on top. |
| `Chip` | Tags, status pills, toggle filter pills | Variants: `neutral`, `accent`, `status-published`, `status-draft`, `status-rejected`. Pass `onToggle` for toggle-pill behavior (auto-adds `aria-pressed`); pass `onDismiss` for an `×` close affordance. |
| `ChipGroup` | Row of toggle chips | Handles horizontal-scroll overflow and exposes a trailing "Clear" chip via `onClear`. Use in any filter strip. |
| `SegmentedControl` | Mutually-exclusive selection within a single context | The level filter on `WodDetail` is the canonical example. Use this for radio-group-like UIs with 2–5 options. **Not** for page-level tab navigation (those are still custom — see "Patterns to extract" below). |
| `Badge` | Small numeric count next to a nav item or icon | 10px font, `min-w-5`. **Not** for big heading-counts — those use a separate `text-sm` chip pattern shared between `Members` and `ProgramsIndex`. |
| `EmptyState` | Empty list/page with title, body, optional CTA | Use whenever a data fetch returns zero results. Don't render a bare paragraph like "No X yet". |
| `Skeleton` | Loading state placeholder | Variants: `feed-row`, `history-row`, `calendar-cell`. Pass `count` to repeat. **Always** use this instead of a "Loading…" string. |

### Token modules — `apps/web/src/lib/`

- **`workoutTypeStyles.ts`** — `WORKOUT_TYPE_STYLES[type]` returns `{ abbr, label, category, tint, bg, accentBar }` for every `WorkoutType`. Any surface that renders a workout type **must** pull from this map. The deprecated `TYPE_ABBR` shim in `lib/api.ts` re-exports `.abbr` only; new code should reach for `WORKOUT_TYPE_STYLES` directly.
- **`workoutTypeStyles.WORKOUT_CATEGORIES`** — display order for category groupings in pickers/lists.

### Dark-theme palette conventions

- Page background: `bg-gray-950`. Cards/drawers: `bg-gray-900`. Inputs: `bg-gray-800`.
- Borders: `border-gray-800` (subtle), `border-gray-700` (interactive).
- Primary accent: `indigo-600` (Buttons), `indigo-500` (focus rings, tab underlines).
- Destructive: `rose-600` / `rose-700`.
- Status colors (translucent fills): emerald = published/success, amber = draft/warning, rose = rejected/error.

### A11y baseline (#81 PR 5)

Every interactive element must satisfy these. The primitives above already do — only worry about it when you're writing a one-off control.

- **Contrast:** text under 14px (`text-xs`, `text-[10px]`, `text-[11px]`) uses `text-gray-400` or lighter. `text-gray-500` passes contrast only at `text-sm` (14px) and larger — fine for de-emphasized secondary copy. Reserve `text-gray-600` for invisible / disabled / decorative-only states (e.g. `·` separators marked `aria-hidden="true"`); never put it on visible user-facing copy. Lighthouse will flag any of these.
- **Touch targets:** the WCAG 2.5.8 AA bar is **24×24** (Lighthouse uses this); aim for **28×28** as the team default. Audit candidate: `grep -rE "w-[0-5]\b|h-[0-5]\b" apps/web/src` — every match should be non-interactive. When you need a bigger hit area without growing the surrounding layout, pair the size bump with a margin clawback: `className="-my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center …"`. For checkbox + label pairs, `min-h-7` on the wrapping `<label>` clears the hit area without enlarging the visible checkbox.
- **Focus rings:** always `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950` (offset color matches the parent surface — use `ring-offset-gray-900` inside a drawer). Use the primitive instead of duplicating this string.
- **`title`** attribute on truncated text for hover reveal (e.g. workout pills in calendar cells).

### ARIA patterns (lessons-learned)

- **Toggle button** (`Chip` with `onToggle`, color-swatch pickers, etc.): `role="button"` (the default for `<button>`) + `aria-pressed={selected}`.
- **Radio group** (`SegmentedControl`-style mutually-exclusive selection): container is `role="radiogroup"`; each segment is `role="radio"` with `aria-checked={selected}`. **Do NOT also set `aria-pressed`** — axe's `aria-allowed-attr` rule rejects `aria-pressed` on `radio`. Pair this with **roving tabindex**: only the selected segment has `tabIndex={0}`, others `tabIndex={-1}`. Arrow keys move selection (and focus follows).
- **Form selects:** pair `<label htmlFor="x">` with `<select id="x">`. Sibling proximity is **not** enough — both axe and screen readers require the explicit association. When there's no visible label (e.g., a single-purpose toolbar select), use `aria-label` instead.
- **Decorative-only icons / separators:** add `aria-hidden="true"` so axe's contrast rule skips them.

### When to extract a new primitive

Extract when **the same pattern appears in 3+ places** (or 2 with strong likelihood of a third). Don't pre-extract. Two more checks before committing to it:

1. There's interactive behavior worth encapsulating: keyboard handling, ARIA state, focus management, or a non-trivial style permutation (variants).
2. Pulling it out makes consumer code visibly tighter — the consumer reads as intent, not as a styling recipe.

If only the visual is shared but the behavior is trivial (e.g., a one-line styled `<div>`), inline the markup. If the behavior is shared but the visual differs heavily across uses, prefer a hook/utility over a primitive. If the same enum value drives styling across multiple surfaces, that's a **token map** under `lib/<domain>Styles.ts`, not a primitive.

**Process for adding one:**

1. Identify the two real call sites and sketch the prop API on paper. Variants belong as discriminated string unions, not boolean props (`variant: 'primary' | 'secondary'`, never `isPrimary` + `isSecondary`). Default the most-used variant in the prop signature so consumers can pass nothing for the common case.
2. Add the file under `apps/web/src/components/ui/<Name>.tsx`. Include the shared `FOCUS_RING` constant if interactive. Mirror the existing primitives' shape — generic over the value type when relevant (see `SegmentedControl<T extends string>`).
3. Co-locate `<Name>.test.tsx` covering: each variant renders, click / keyboard fires the right handlers, `disabled` blocks both, and `aria-*` attributes reflect state. Follow the existing primitive tests for shape.
4. Migrate **at least one** real call site in the same PR — never ship an unconsumed primitive. If it's worth pulling out, it's worth proving the pull-out fits at a real call site.
5. Add a row to the *Primitives* table above and remove the entry from *Patterns to extract* if it was flagged.
6. Run `npx vitest run` — including the page-level `apps/web/src/test/a11y.test.tsx` axe check — before opening the PR.

**Patterns to extract** (flagged but not yet primitive):
- **Drawer** — slide-from-right + overlay + Escape-to-close. Currently re-implemented in `WorkoutDrawer`, `LogResultDrawer`, `ProgramFormDrawer`. Worth extracting next time someone touches them.
- **Tabs** — page-section navigation with underline indicator. Currently custom in `ProgramDetail`; will repeat in slice 4 of #82 (Browse + Members tabs).
- **FormField + TextInput / Textarea / DatePicker** — every form repeats `<label class="text-xs text-gray-400">` + styled input. Extract when a third form joins (slice 3 of #82 likely is it).
- **HeadingCount** — the `text-sm` count chip next to page headings (Members, ProgramsIndex use the same `<span class="bg-gray-700 text-sm px-2 py-0.5 rounded-full">{N}</span>` literal twice). Extract to ui/HeadingCount.tsx if a third caller appears.
- **ConfirmDialog** — currently using `window.confirm` for delete confirmations. Replace with a primitive when we want consistent in-app styling.

### Reference

Visual guide with before/after mockups: `resources/design-guide.html`. Issue #81 has the full implementation plan in 5 PRs.

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
npm run test --workspace=@wodalytics/api
# or from apps/api:
cd apps/api && npx dotenv-cli -e ../../.env -- sh -c 'for f in tests/*.ts; do npx tsx "$f" || exit 1; done'
```

**Requires:** API running on `localhost:3000`, DB accessible via `DATABASE_URL`.

**Test files:** `apps/api/tests/` — one `.ts` file per domain.

**Adding a new test file:** Follow the pattern in any existing file. Add the new script to the `test` command in `apps/api/package.json`.

---

### Web unit tests (Vitest + React Testing Library)

Located in `apps/web/src/**/*.test.tsx`. Each test file lives next to the component it covers.

**Run:**
```bash
npm run test:unit --workspace=@wodalytics/web
# or from apps/web:
cd apps/web && npx vitest run
```

**Requires:** nothing running — fully in-process, no server or DB needed.

**Setup:** Vitest is configured in `vite.config.ts` (`test.environment: 'jsdom'`). The global setup file `src/test/setup.ts` imports `@testing-library/jest-dom` matchers. Vitest globals (`describe`, `it`, `expect`, `vi`) are enabled so no imports are needed in test files.

**When to write unit tests vs E2E:**
- Unit tests cover **component rendering and logic**: does the page render without crashing? Are the right elements shown given a mocked API response? Use `vi.mock('../lib/api')` to control API responses.
- E2E tests (Playwright) cover **user flows end-to-end**: navigation, real API calls, DB state. Use E2E when the correctness depends on the full stack.
- **Every page must have at least one render test** that asserts it mounts without throwing. This catches crashes from type mismatches, missing fields, or bad assumptions about API shape — bugs that would otherwise only surface in the browser.

**Test files:** `apps/web/src/` — co-located with the component as `*.test.tsx`.

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
npm run test --workspace=@wodalytics/web   # runs unit tests first, then E2E
npm run test:e2e --workspace=@wodalytics/web  # E2E only
# or from apps/web:
cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test
```

**Requires:** `turbo dev` running (API on `:3000`, web on `:5173`).

**Test files:** `apps/web/tests/` — one `.spec.ts` file per user flow.

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
