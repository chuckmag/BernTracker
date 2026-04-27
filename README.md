# WODalytics

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

#### Expo has two distinct modes — know which one you need

| Mode | Tool | Account required? | When to use |
|---|---|---|---|
| **Development** | Expo Go app | No | Running the app locally on your phone/simulator during development |
| **Production builds** | EAS (Expo Application Services) | Yes | Building the app binary for App Store / TestFlight / Play Store |

**Expo Go** is a free app from the App Store / Play Store. Point it at your running dev server (via QR code) and the app loads immediately. No Expo account, no Apple Developer account, no build step. This is what we use for all development work.

**EAS (Expo Application Services)** is Expo's cloud build and deployment platform. It handles:
- Building native iOS (`.ipa`) and Android (`.aab`) binaries in the cloud — so you don't need Xcode locally
- Submitting those binaries to Apple App Store / Google Play Console
- Over-the-air (OTA) updates to push JS changes to users without App Store review

#### Do engineers need an Expo account?

**For development:** No. Expo Go works without any account.

**For app store distribution:** Yes — you need an EAS account. For a team project, use an **Expo organization account** rather than a personal one so the project isn't tied to one person's login. When the time comes, the owner creates the org at [expo.dev](https://expo.dev) and invites team members.

#### EAS setup (defer until pre-launch)

When you're ready to distribute to TestFlight or the Play Store, run:

```bash
# 1. Link the project to your Expo organization account (run once)
npx eas-cli@latest init

# 2. Configure build profiles (creates eas.json — commit this file)
npx eas-cli@latest build:configure

# 3. Build for both platforms and submit to stores (when ready to release)
npx eas-cli@latest build --platform all --auto-submit
```

> **Not now:** `eas build` costs EAS build credits, requires an Apple Developer Program account ($99/yr) and Google Play Console account ($25 one-time), and is only relevant at the point of shipping to users. This is a Slice 5+ concern.

---

### Docker

A containerization tool that packages software and its dependencies into an isolated, reproducible environment.

**What it does here:** We use Docker exclusively to run PostgreSQL locally during development. Rather than installing Postgres directly on your machine (which varies by OS, requires manual version management, and can conflict with other projects), Docker spins up an official Postgres container in one command and tears it down just as easily.

**If you've used:** Homebrew to `brew install postgresql` — Docker is similar in that it gets Postgres running on your machine, but the database lives inside a container rather than your system. The big difference: every developer gets the exact same Postgres version with zero configuration, and it doesn't touch your system outside of Docker.

**Daily usage:**

```bash
# First time — start the database (runs in the background)
docker run --name wodalytics-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=wodalytics \
  -p 5432:5432 \
  -d postgres:16

# After the container exists — just start/stop it
docker start wodalytics-db
docker stop wodalytics-db

# Check if it's running
docker ps
```

> **Prerequisites:** Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) for Mac. No other Postgres installation needed.

---

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
├── package.json      # npm workspaces root
└── turbo.json
```

## Getting started

### Prerequisites

- Node.js 18+
- Docker Desktop — used to run PostgreSQL locally (see [Docker](#docker) above)

### Setup

```bash
# Install all dependencies
npm install

# Create your local env file from the root template (single file for all apps)
cp .env.example .env
# Edit .env — required: DATABASE_URL, JWT_SECRET
# For auth (Slice 2+): fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#   GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID
# See issue #9 for how to create credentials in Google Cloud Console

# Run database migrations
npm run db:migrate

# Start all apps
turbo dev
```

### Commands

```bash
turbo dev        # start API (3000), web (5173), and Expo bundler concurrently
turbo build      # build all apps and packages
```

### Schema migrations

Any time you change `packages/db/prisma/schema.prisma`, run the migration command and **commit the generated file** before opening or merging a PR:

```bash
npm run db:migrate
# adds a new file under packages/db/prisma/migrations/<timestamp>_<name>/migration.sql
git add packages/db/prisma/migrations/
git commit -m "chore(db): add migration for <description>"
```

> **Important:** Never merge a PR that modifies the schema without the corresponding migration file committed. Missing migration files cause drift errors for other developers and in production — and recovering from drift requires a destructive `prisma migrate reset`.

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