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

**Data model:** [`packages/db/README.md`](./packages/db/README.md)

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

### Required tools

Everything below must be installed before the project will run. On macOS, [Homebrew](https://brew.sh) is the easiest way to install most of them — install it first if you don't have it:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

| Tool | Why | macOS (Homebrew) | Windows |
|---|---|---|---|
| **Git** | Version control | `brew install git` | [git-scm.com](https://git-scm.com/download/win) |
| **Node.js 20+** | Runs the API, web app, and all tooling | `brew install node` | [nodejs.org](https://nodejs.org) |
| **Docker Desktop** | Runs PostgreSQL locally in a container | `brew install --cask docker` | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Expo Go** (mobile only) | Opens the mobile app on your phone during development | iOS / Android app store | iOS / Android app store |

> **Windows note:** Node.js and npm work natively on Windows. Docker Desktop requires WSL2 — the installer will guide you through enabling it.

> **iOS Simulator / Android Emulator (optional):** If you want to run the mobile app in a simulator rather than on a physical device, you additionally need Xcode (macOS, for iOS) or Android Studio (cross-platform, for Android). This is not required to get started.

---

### Setup

Follow these steps in order on a fresh clone. Steps marked **manual** require action in your terminal or a GUI app — Claude Code cannot perform them on your behalf. Steps marked **automatic** can be run by Claude.

**1. Start Docker Desktop** *(manual)*
Open Docker Desktop from your Applications folder (macOS) or Start Menu (Windows) and wait for it to fully start. The whale icon in your menu bar will stop animating when it's ready.

**2. Start the database container** *(manual — first time only)*
```bash
docker run --name berntracker-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=berntracker \
  -p 5432:5432 \
  -d postgres:16
```
On subsequent sessions, just run `docker start berntracker-db`.

**3. Install dependencies** *(automatic)*
```bash
npm install
```

**4. Create your local env file** *(manual)*
```bash
cp .env.example .env
```
The default values in `.env.example` already match the Docker container above — no edits needed for local development.

**5. Run database migrations** *(automatic)*
```bash
npm run db:migrate
```
When prompted for a migration name, enter `init`. This creates all tables in the database.

**6. Verify the database** *(automatic)*
```bash
npm run db:studio
```
Prisma Studio opens in your browser. Confirm that all tables defined in `packages/db/prisma/schema.prisma` are present.

**7. Start all apps** *(automatic)*
```bash
turbo dev
```
- API → http://localhost:3000
- Web admin → http://localhost:5173
- Mobile → Expo QR code in terminal (scan with Expo Go)

---

### Daily workflow

```bash
docker start berntracker-db   # start the database (if not already running)
turbo dev                      # start all apps
```

---

### Commands

```bash
turbo dev          # start API (3000), web (5173), and Expo bundler concurrently
turbo build        # build all apps and packages
npm run db:migrate # run any new Prisma migrations
npm run db:studio  # open Prisma Studio to inspect the database
```

## Issue index (will be out of date after v1 prototype)

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