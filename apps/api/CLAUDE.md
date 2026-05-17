# apps/api — CLAUDE.md

API-specific guidance. See the repo-root `CLAUDE.md` for cross-cutting topics (worktree dev, enums, PR rules, schema migrations).

> **Convention:** any new pattern, primitive, or rule that applies only to the API belongs here, not in the root.

## Architecture

- **Style:** REST.
- **Auth middleware:** `src/middleware/auth.ts` — single verification point for all routes.
- **Data model source of truth:** `packages/db/prisma/schema.prisma`.
- **Shared result value types:** `packages/types/src/result.ts`.

## DB manager pattern

All Prisma queries must live in model-specific manager files under `packages/db/src/managers/`, not inline in route handlers. One file per Prisma model (or logical model group). Import them from `@wodalytics/db`:

```typescript
import { findGymById, findGymMembershipByUserAndGym } from '@wodalytics/db'
```

Example managers:
```
packages/db/src/managers/
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

Jobs have their own workspace at `apps/jobs/`. See `apps/jobs/CLAUDE.md` for all job conventions, Railway setup, and how to add new jobs. This service does not import job code at runtime — jobs are a fully separate build and Railway deployment.

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
