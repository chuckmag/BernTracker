# apps/api — CLAUDE.md

API-specific guidance. See the repo-root `CLAUDE.md` for cross-cutting topics (worktree dev, enums, PR rules, schema migrations).

> **Convention:** any new pattern, primitive, or rule that applies only to the API belongs here, not in the root.

## Architecture

- **Style:** REST.
- **Auth middleware:** `src/middleware/auth.ts` — single verification point for all routes.
- **Data model source of truth:** `packages/db/prisma/schema.prisma`.
- **Shared result value types:** `packages/types/src/result.ts`.

## DB manager pattern

All Prisma queries must live in model-specific manager files under `src/db/`, not inline in route handlers. One file per Prisma model (or logical model group):

```
src/db/
  gymDbManager.ts          # prisma.gym.*
  userGymDbManager.ts      # prisma.userGym.* (memberships)
  gymProgramDbManager.ts   # prisma.gymProgram.* + prisma.program.create
  userProgramDbManager.ts  # prisma.userProgram.* (subscriptions)
```

**Naming rules:**
- File: `<model>DbManager.ts` (camelCase, matches the Prisma model name).
- Functions: verbose and descriptive — name what the query does, not just what it calls.
  - `findMembersWithProgramSubscriptionsByGymId(gymId)` — good
  - `createGymAndAddOwnerMember(data, ownerId)` — good
  - `getMembers(gymId)` — too vague
  - `userGymFindMany(gymId)` — just restates the Prisma call

Route handlers should read like high-level orchestration — guard clauses, call managers, return responses — with no raw `prisma.*` calls.

## Route handler style

Route handlers must be extracted into **named async functions** — do not pass inline lambdas directly to `router.get/post/patch/delete`. Named handlers make the router registration self-documenting.

```typescript
// Good — router reads like a table of contents
async function getWorkoutsByGymAndDateRange(req: Request, res: Response) { ... }
router.get('/gyms/:gymId/workouts', requireAuth, requireGymMembership, getWorkoutsByGymAndDateRange)

// Avoid — logic buried in registration call
router.get('/gyms/:gymId/workouts', requireAuth, async (req, res) => { ... })
```

## Error logging conventions

Use `console.log("")` (not `console.error`) for diagnostic output. Log at every auth/authorization failure point and whenever catching an unexpected exception.

**Auth failures** — include the HTTP method, path, and relevant context:
```typescript
console.log(`[auth] requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
console.log(`[auth] requireRole: access denied — ${req.method} ${req.path} — userId=${req.user?.id} role=${req.user?.role} required=${roles.join('|')}`)
```

**Unexpected exceptions in route handlers** — include the path and the error:
```typescript
console.log(`[error] ${req.method} ${req.path} — ${err instanceof Error ? err.message : err}`, err)
```

The global error-handling middleware in `src/index.ts` automatically logs and returns 500 for any uncaught exception thrown from a route handler — route handlers should `throw` rather than swallow errors they cannot handle.

## Background jobs

One-shot scripts triggered on a schedule live under `src/jobs/`. The dispatcher at `src/jobs/index.ts` is the CLI entrypoint — it reads the job name from `argv[2]` (or `process.env.JOB_NAME` as fallback), looks it up in the `JOBS` map, runs the matching handler, disconnects Prisma, and exits (`0` on success, `1` on handler error, `2` on unknown / missing job name).

Each job is its own Railway service, all sharing the `Dockerfile.jobs` image. The Dockerfile's CMD is `sh -c "exec node apps/api/dist/jobs/index.js \"${JOB_NAME:-noop}\""`, so the only per-service difference is the `JOB_NAME` service variable (set in the Railway dashboard). Cron cadence is also configured per-service in the dashboard. Do **not** use Railway's `startCommand` to pick the job — that path was unreliable on QA (the cron container produced no logs at all).

**Adding a new job:**
1. Create `src/jobs/<name>.ts` exporting an async handler.
2. Register it in the dispatcher's `JOBS` map in `src/jobs/index.ts`.
3. In Railway: create a new cron service from this repo, point its build at `apps/api/railway.jobs.toml`, set `JOB_NAME=<name>` and the desired cron schedule.

**Local invocation:**
```bash
# from repo root — argv path
npm run dev:jobs -- <name>

# or, mirroring prod via the env var
JOB_NAME=<name> npm run job --workspace=@wodalytics/api

# or, full Docker-image repro of the Railway service
docker compose --profile jobs run --rm -e JOB_NAME=<name> jobs
```

The Express API service does **not** import job code at runtime — the two services share modules under `src/lib/` and `src/db/`, but have separate entrypoints and separate Railway deployments. A job failure cannot affect the user-facing API.

## Integration tests

Located in `tests/`. Each file is a self-contained TypeScript script that:
- Seeds all fixtures directly via Prisma (no HTTP for setup).
- Signs JWT tokens in-process via `signTokenPair` from `../src/lib/jwt.js`.
- Drives assertions through the live API using `fetch()`.
- Cleans up all created data in a `finally` block.

**Run all tests:**
```bash
# from worktree root — uses worktree-aware ports
npm run test:worktree -- api

# from repo root, against default ports
npm run test --workspace=@wodalytics/api
```

**Run a single test file:**
```bash
# from apps/api/
npx dotenv-cli -e ../../.env -- npx tsx tests/<file>.ts

# or with a worktree-picked API port:
API_URL="$(node -e 'console.log(JSON.parse(require("fs").readFileSync("../../.dev-ports.local")).apiUrl + "/api")')" \
  npx dotenv-cli -e ../../.env -- npx tsx tests/<file>.ts
```

**Requires:** API running (default `localhost:3000`, or worktree-picked port), DB accessible via `DATABASE_URL`.

**Adding a new test file:** follow the pattern in any existing file. Add the new script to the `test` command in `package.json`.
