# packages/db — CLAUDE.md

The database package is the shared business-logic layer for the entire monorepo. Every consumer that needs to read or write data — the REST API, the MCP server, background jobs, and any future client — calls functions from this package rather than reaching for `prisma` directly.

## The one rule

**No raw `prisma.*` calls outside this package.** All Prisma access lives in `src/managers/`. Consumers import named functions from `@wodalytics/db`.

```typescript
// Correct — any consumer
import { findBenchmarkSummaryForUser, logBenchmarkResult } from '@wodalytics/db'

// Wrong — Prisma leaking into a route, tool, or job
import { prisma } from '@wodalytics/db'
const results = await prisma.benchmarkResult.findMany(...)
```

The reason: when the query lives in a manager, every client gets the fix or optimisation for free. When the query lives in a route, the MCP tool duplicates it, the job duplicates it, and all three drift apart.

## Manager files

One file per Prisma model or closely-related model group. Location: `src/managers/<model>DbManager.ts`.

```
src/managers/
  benchmarkResultDbManager.ts   # BenchmarkResult + merged-history aggregations
  gymDbManager.ts               # Gym
  resultDbManager.ts            # Result + leaderboard + PR detection
  namedWorkoutDbManager.ts      # NamedWorkout
  ...
```

Managers may query multiple Prisma models when the operation is logically atomic — e.g. `logBenchmarkResult` looks up a `NamedWorkout` and creates a `BenchmarkResult` in the same function. That is the right place for that join; it is not the right place for HTTP status decisions.

## Naming conventions

| Good | Why |
|---|---|
| `findBenchmarkSummaryForUser(userId)` | States what is returned and the key parameter |
| `logBenchmarkResult(userId, namedWorkoutId, input)` | Domain verb, not a Prisma verb |
| `findBenchmarkHistoryForUser(userId, namedWorkoutId)` | Returns a shaped result, not a raw row |
| `detectAndUpsertStrengthPrs(...)` | Two operations, named explicitly |

| Bad | Why |
|---|---|
| `getResults(userId)` | Too vague |
| `benchmarkResultFindMany(userId)` | Just restates the Prisma call |
| `fetch(id)` | No model, no context |

## What belongs in a manager

- Multi-step DB workflows that must stay atomic or consistent (lookup + create, lookup + aggregate)
- Query shaping: `include`, `select`, `orderBy`, `take` decisions
- Cross-model joins when logically part of one operation
- Aggregation and normalization (e.g. merging two result sources into a unified history array, grouping by name for counts)

## What does NOT belong in a manager

- Zod validation — that happens in routes/tools before calling the manager
- HTTP status codes or MCP error shapes — the manager returns data or `null`; the caller decides what 404 means
- Auth/permission checks beyond ownership scoping on the WHERE clause — middleware handles role gates
- `derivePrimaryScore` and other `@wodalytics/types` utilities — `packages/db` does not depend on `packages/types`; pass pre-computed values in (e.g. `primaryScoreKind`, `primaryScoreValue`) or let the caller derive them

## Return values for not-found

Prefer returning `null` when a record doesn't exist rather than throwing. This keeps Prisma implementation details out of the callers — a `null` check is transport-agnostic.

```typescript
// Good — caller decides what null means
export async function findBenchmarkHistoryForUser(userId: string, namedWorkoutId: string) {
  const nw = await prisma.namedWorkout.findUnique({ where: { id: namedWorkoutId } })
  if (!nw) return null
  // ...
}

// Avoid — caller must know Prisma's P2025 code
export async function findBenchmarkHistoryForUser(...) {
  return prisma.namedWorkout.findUniqueOrThrow(...)
}
```

Callers map `null` to their transport's not-found format (HTTP 404, MCP error content, job log message, etc.).

## Unique-constraint violations (P2002)

Let Prisma's P2002 propagate. The caller catches it and maps it to the right transport error (HTTP 409, MCP error). The manager does not need to inspect or re-throw it.

## Exporting

Every public function must be re-exported from `src/index.ts`. New manager files must be added with `export * from './managers/<name>.js'`.
