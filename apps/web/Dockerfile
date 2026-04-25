# syntax=docker/dockerfile:1

# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

RUN npx turbo build --filter=@berntracker/web

# ── Stage 2: serve ───────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Defaults for local dev; Railway overrides these at runtime.
ENV PORT=80
ENV API_INTERNAL_HOST=api
ENV API_INTERNAL_PORT=3000
# Limit envsubst to these specific vars so nginx's own $host, $uri, etc. are left alone.
ENV NGINX_ENVSUBST_FILTER='^(PORT|API_INTERNAL_HOST|API_INTERNAL_PORT)$'

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
