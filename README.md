# BernTracker

A CrossFit workout tracking tool for gym members and trainers.

---

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

---

## Technology overview

### Turborepo

A build system for monorepos. It understands that this codebase has multiple packages that depend on each other and coordinates running commands across all of them.

**What it does here:** `turbo dev` starts the API, web app, and mobile app simultaneously in the right order — packages build before the apps that depend on them. It also caches build outputs so re-running `turbo build` only rebuilds what changed.

**If you've used:** GNU Make (dependency graph, only runs what changed), GitHub Actions (pipeline coordination) — same ideas applied locally to a multi-package repo. The alternative without Turbo would be manually chaining `npm run dev` commands across workspaces.

---

### Prisma

A type-safe database toolkit for Node.js with three parts:

1. **Schema** (`packages/db/prisma/schema.prisma`) — defines the entire data model in one place; this is the source of truth
2. **Migrate** — reads schema changes and generates + runs SQL migrations automatically
3. **Client** — an auto-generated, type-safe query builder

**What it does here:** You write `prisma.workout.findMany({ where: { status: 'PUBLISHED' } })` and get back fully-typed TypeScript objects. No raw SQL, no string-based query builders, no manually maintained type definitions.

**If you've used:** Sequelize or TypeORM (same idea — ORM for Node, but Prisma's generated types are significantly better), Rails ActiveRecord (similar in spirit). Raw SQL via the `pg` package directly would be the no-ORM alternative.

---

### Expo

A framework and toolchain built on top of React Native that handles all the painful native platform setup.

**What it does here:** Without Expo, a React Native app requires Xcode, Android Studio, CocoaPods, Gradle, and significant native configuration before writing a single screen. With Expo:
- `npx expo start` launches a dev server
- Scan the QR code with the **Expo Go** app on your phone — the app loads instantly, no Xcode build required
- JS-only updates don't require going through App Store review

**If you've used:** Create React App or Vite for web React — Expo is the same idea for mobile. It removes the setup burden so you can focus on writing app code rather than fighting toolchains.

---

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
├── package.json      # npm workspaces root
└── turbo.json
```

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL (or Docker: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`)

### Setup

```bash
# Install all dependencies
npm install

# Copy env files and set DATABASE_URL
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env

# Generate Prisma client and run migrations
cd packages/db && npx prisma migrate dev --name init

# Start all apps
turbo dev
```

### Commands

```bash
turbo dev        # start API (3000), web (5173), and Expo bundler concurrently
turbo build      # build all apps and packages
```

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
