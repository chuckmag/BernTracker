# syntax=docker/dockerfile:1

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/mcp/package.json ./apps/mcp/

RUN npm ci

COPY packages/ ./packages/
COPY apps/mcp/ ./apps/mcp/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npx turbo build --filter=@wodalytics/mcp

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/mcp/package.json ./apps/mcp/
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist

EXPOSE 3002

CMD ["node", "apps/mcp/dist/index.js"]
