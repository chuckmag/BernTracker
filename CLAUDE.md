# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BernTracker is a CrossFit workout tracking tool for gym members and trainers.

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
├── package.json       # npm workspaces root
└── turbo.json
```

## Commands

```bash
turbo dev          # start all apps concurrently
turbo build        # build all apps
npm run db:migrate # run Prisma migrations (uses root .env via dotenv-cli)
npm run db:studio  # open Prisma Studio
```

## Developer onboarding

When an engineer asks for help setting up the project, use the README Getting Started section as the guide. Some steps can be run automatically via tools; others require manual action from the engineer.

### Steps Claude CAN run automatically
- `npm install` — install all workspace dependencies
- `npm run db:migrate` — run migrations (once Docker + DB are running)
- `npx prisma generate` — regenerate the Prisma client after schema changes
- `npx tsc --noEmit` — typecheck any package
- `git` operations, file creation, edits

### Steps that require manual action from the engineer
- Installing Homebrew, Node.js, Git, or Docker Desktop — requires system-level install
- **Starting Docker Desktop** — must be opened as a GUI app before any `docker` commands work; if the engineer sees `dial unix /var/run/docker.sock: no such file or directory`, Docker Desktop is not running
- **Running `docker run --name berntracker-db ...`** — creates the Postgres container; only needed once. On subsequent sessions: `docker start berntracker-db`
- **Copying `.env.example` → `.env`** — file contains secrets and must be created manually
- Installing Expo Go on a physical device

### Common setup errors and fixes
| Error | Cause | Fix |
|---|---|---|
| `dial unix /var/run/docker.sock: no such file or directory` | Docker Desktop not running | Open Docker Desktop and wait for it to start |
| `Unable to find image 'berntracker-db:latest'` | Ran `docker run berntracker-db` instead of the full command | Run the full `docker run` command with `postgres:16` as the image |
| `P1001: Can't reach database server at localhost:5432` | Postgres container not running | `docker start berntracker-db` |
| `Environment variable not found: DATABASE_URL` | `.env` file missing | `cp .env.example .env` from repo root |
| `command not found: turbo` | Dependencies not installed | `npm install` from repo root |

## Architecture

- API style: REST (see #8 for REST vs GraphQL analysis)
- Auth middleware: `apps/api/src/middleware/auth.ts` — single verification point for all routes
- Data model source of truth: `packages/db/prisma/schema.prisma`
- Shared result value types: `packages/types/src/result.ts`

## Key enums

```prisma
enum Role          { OWNER, PROGRAMMER, COACH, MEMBER }
enum WorkoutType   { STRENGTH, FOR_TIME, EMOM, CARDIO, AMRAP, METCON, WARMUP }
enum WorkoutLevel  { RX_PLUS, RX, SCALED, MODIFIED }
enum WorkoutStatus { DRAFT, PUBLISHED }
enum Gender        { WOMAN, MAN, NON_BINARY, PREFER_NOT_TO_SAY }  // User.identifiedGender — nullable, self-identified
enum WorkoutGender { MALE, FEMALE, OPEN }                          // Result.workoutGender — required, leaderboard grouping
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
