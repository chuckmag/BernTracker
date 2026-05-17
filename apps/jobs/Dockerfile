# syntax=docker/dockerfile:1

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/server/package.json ./packages/server/
COPY packages/types/package.json ./packages/types/
COPY apps/jobs/package.json ./apps/jobs/

RUN npm ci

COPY packages/ ./packages/
COPY apps/jobs/ ./apps/jobs/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npx turbo build --filter=@wodalytics/jobs

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Full node_modules is copied (not `npm ci --omit=dev`) so the generated
# Prisma client (and its devDependency-installed engine) is available at runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/jobs/package.json ./apps/jobs/
COPY --from=builder /app/apps/jobs/dist ./apps/jobs/dist

# One image, many jobs: each Railway service sets `JOB_NAME` to the registry
# key it wants to run (see `src/index.ts`). The `sh -c` form expands the
# env var into argv before exec'ing node.
CMD ["sh", "-c", "exec node apps/jobs/dist/index.js \"${JOB_NAME:-noop}\""]
