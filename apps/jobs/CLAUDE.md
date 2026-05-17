# apps/jobs — CLAUDE.md

Background jobs workspace. See the repo-root `CLAUDE.md` for cross-cutting topics.

## Architecture

One-shot scripts triggered on a schedule (or manually) live under `src/`. The dispatcher at `src/index.ts` is the CLI entrypoint — it reads the job name from `argv[2]` (or `process.env.JOB_NAME` as fallback), looks it up in the `JOBS` map, runs the matching handler, disconnects Prisma, and exits (`0` on success, `1` on handler error, `2` on unknown / missing job name).

Each job is its own Railway service, all sharing the `Dockerfile` image. The Dockerfile's CMD is `sh -c "exec node apps/jobs/dist/index.js \"${JOB_NAME:-noop}\""`, so the only per-service difference is the `JOB_NAME` service variable (set in the Railway dashboard). Cron cadence is also configured per-service in the dashboard. Do **not** use Railway's `startCommand` to pick the job — that path was unreliable on QA (the cron container produced no logs at all).

## Registered jobs

| `JOB_NAME` | Cadence | Description |
|---|---|---|
| `crossfit-wod` | 15 min cron | Fetches today's CrossFit Mainsite WOD and saves it to the public program |
| `named-workouts` | Weekly cron | Ingests Hero WODs (CrossFit HTML) + Girls WODs + Benchmarks (WODwell REST API) |
| `seed-crossfit-movements` | One-shot | Populates the Movement catalog from CrossFit's movement library |
| `dedupe-legacy-movements` | One-shot | Collapses pre-seed legacy Movement rows onto their canonical entries |
| `noop` | — | Smoke-test handler; does nothing |

## Adding a new job

1. Create `src/<name>.ts` exporting an async handler `run<Name>Job(deps?)`.
2. Add shared HTTP utilities (if any) to `src/lib/`.
3. Register it in the `JOBS` map in `src/index.ts`.
4. Add a test in `tests/<name>.ts` using the `deps` injection pattern to stub HTTP.
5. In Railway: create a new cron service from this repo, point its build at `apps/jobs/railway.jobs.toml`, set `JOB_NAME=<name>` and the desired cron schedule.

## Conventions

- **Logger:** `createLogger('jobs.<name>')` from `@wodalytics/server`.
- **HTTP:** Node.js built-in `fetch` with `AbortSignal.timeout()`. Inject via `deps.fetchImpl` for test stubs.
- **DB:** Use manager functions from `@wodalytics/db` — no raw `prisma.*` calls inside job files.
- **Soft-fail per source:** catch upstream errors, log a warning, continue. Hard-fail on DB errors (propagates → dispatcher exits non-zero → Railway flags the run).
- **Idempotency:** every job must be safe to re-run. Use unique constraints or existence checks before writing.

## Local invocation

```bash
# from repo root — runs via tsx (no build required, recommended for local dev)
npm run dev:jobs -- <name>

# mirroring prod via env var (also tsx / no build required)
JOB_NAME=<name> npm run dev --workspace=@wodalytics/jobs

# runs compiled dist — requires a prior `turbo build --filter=@wodalytics/jobs`
JOB_NAME=<name> npm run job --workspace=@wodalytics/jobs

# full Docker-image repro of the Railway service
docker compose --profile jobs run --rm -e JOB_NAME=<name> jobs
```

## Integration tests

Located in `tests/`. Each file:
- Seeds fixtures directly via Prisma (no HTTP for setup).
- Stubs HTTP via the job's `deps.fetchImpl` — never hits live URLs in CI.
- Cleans up all created data in a `finally` block.

**Run all job tests:**
```bash
# from worktree root — uses worktree-aware ports
npm run test:worktree -- jobs

# from apps/jobs/ directly
npx dotenv-cli -e ../../.env -- sh -c 'for f in tests/*.ts; do npx tsx "$f" || exit 1; done'
```
