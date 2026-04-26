# @wodalytics/db — Data Model

This package owns the Prisma schema and exports a singleton `PrismaClient`. It is the single source of truth for the WODalytics data model.

Schema file: [`prisma/schema.prisma`](./prisma/schema.prisma)

---

## Entity overview

```
Gym ────────────── GymProgram ──────────── Program
 │                                            │
 │                                            │
UserGym                                   UserProgram
 │                                            │
 └──────────────── User ────────────────── Result
                    │                         │
                    └────── Workout ───────────┘
```

---

## Models

### User

The central entity. Represents a gym member, coach, programmer, or gym owner.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `email` | `String` | Unique |
| `name` | `String` | Display name |
| `role` | `Role` | Global platform role — see Roles below |
| `identifiedGender` | `Gender?` | Nullable self-identified gender — see Gender below |
| `passwordHash` | `String?` | Null for OAuth-only accounts |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

---

### Gym

A CrossFit affiliate or training facility.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `name` | `String` | Display name |
| `slug` | `String` | Unique URL-safe identifier (e.g. `crossfit-bern`) |
| `createdAt` / `updatedAt` | `DateTime` | |

---

### UserGym *(join table)*

Connects a User to a Gym with a per-gym role.

| Field | Type | Notes |
|---|---|---|
| `userId` + `gymId` | Composite PK | |
| `role` | `Role` | The user's role at this specific gym |
| `joinedAt` | `DateTime` | |

A user can belong to multiple gyms and have a different role at each.

---

### Program

A structured training plan (e.g. a 12-week strength cycle). Programs are shared across gyms — a programming company can sell one program to many gyms.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `name` | `String` | |
| `description` | `String?` | |
| `startDate` / `endDate` | `DateTime` | `endDate` nullable for open-ended programs |
| `createdAt` / `updatedAt` | `DateTime` | |

---

### GymProgram *(join table)*

Connects a Program to the Gyms running it. Many-to-many: one program can be adopted by many gyms; one gym can run multiple programs simultaneously.

| Field | Type | Notes |
|---|---|---|
| `gymId` + `programId` | Composite PK | |
| `createdAt` | `DateTime` | When the gym adopted this program |

---

### UserProgram *(join table)*

Enrolls a User in a Program.

| Field | Type | Notes |
|---|---|---|
| `userId` + `programId` | Composite PK | |
| `joinedAt` | `DateTime` | |

---

### Workout

A single training session within a program — or a standalone personal workout logged by a member.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `programId` | `String?` | **Nullable** — personal workouts have no program |
| `title` | `String` | e.g. "Helen" |
| `description` | `String` | Full movement description and rep scheme |
| `type` | `WorkoutType` | AMRAP, FOR_TIME, EMOM, etc. |
| `status` | `WorkoutStatus` | DRAFT or PUBLISHED |
| `scheduledAt` | `DateTime` | When the WOD is programmed |
| `createdAt` / `updatedAt` | `DateTime` | |

> **Note:** `Workout` has no `level` field. The workout description prescribes movement standards per level (e.g. RX = chest-to-bar pull-ups, Scaled = jumping pull-ups). The level a member *actually performed at* is recorded on their `Result`.

---

### Result

A member's logged performance for a specific workout.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `userId` | `String` | |
| `workoutId` | `String` | |
| `level` | `WorkoutLevel` | Which standard the member performed (RX_PLUS, RX, SCALED, MODIFIED) |
| `workoutGender` | `WorkoutGender` | Competitive category for leaderboard grouping — see Gender below |
| `value` | `Json` | Typed score — see Result value shapes below |
| `notes` | `String?` | Optional member notes |
| `createdAt` | `DateTime` | |

A `(userId, workoutId)` unique constraint prevents duplicate results.

---

### OAuthAccount

Stores a linked Google (or future provider) identity for a User.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `userId` | `String` | |
| `provider` | `String` | e.g. `"google"` |
| `providerId` | `String` | Provider's user ID |

`(provider, providerId)` is unique — prevents duplicate OAuth links.

---

### RefreshToken

Stores active JWT refresh tokens. Deleted on logout or token rotation.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | Primary key |
| `userId` | `String` | |
| `token` | `String` | Unique hashed token |
| `expiresAt` | `DateTime` | |

---

## Enums

### Role

Controls access and capabilities on the platform.

| Value | Description |
|---|---|
| `OWNER` | Gym owner — full control over gym settings, members, and programs |
| `PROGRAMMER` | Programs workouts; can publish WODs to enrolled gyms |
| `COACH` | Delivers workouts; can view member results |
| `MEMBER` | Regular gym member; logs results |

Role is stored at two levels:
- `User.role` — global platform role (e.g. someone who is a programmer across many gyms)
- `UserGym.role` — per-gym role override (e.g. a member who is also a coach at one gym)

---

### WorkoutType

| Value | Description |
|---|---|
| `STRENGTH` | Max weight / 1-rep max focus |
| `FOR_TIME` | Complete work as fast as possible |
| `EMOM` | Every Minute On the Minute |
| `CARDIO` | Monostructural cardio (run, row, bike) |
| `AMRAP` | As Many Rounds/Reps As Possible |
| `METCON` | Mixed-modal metabolic conditioning |
| `WARMUP` | Warm-up — not scored on leaderboards |

---

### WorkoutLevel

The movement standard a member performed a workout at.

| Value | Description |
|---|---|
| `RX_PLUS` | Above prescribed — heavier/harder than standard RX |
| `RX` | As prescribed |
| `SCALED` | Reduced load or modified movement |
| `MODIFIED` | Significant modification (injury, beginner) |

---

### WorkoutStatus

| Value | Description |
|---|---|
| `DRAFT` | Not visible to members |
| `PUBLISHED` | Live — members can log results |

---

### Gender

Two separate gender fields exist by design. They serve different purposes and are kept independent so that a user's personal identity never restricts their competitive choices.

**`User.identifiedGender`** — self-identified gender for the user profile. Always nullable; users are never required to share this.

| Value | |
|---|---|
| `WOMAN` | |
| `MAN` | |
| `NON_BINARY` | |
| `PREFER_NOT_TO_SAY` | |

**`Result.workoutGender`** — the competitive category a member chose when submitting a result. Required on every result so that leaderboards can group fairly (Male RX uses heavier prescribed weights than Female RX).

### WorkoutGender

| Value | Description |
|---|---|
| `MALE` | Male RX weight/movement standards |
| `FEMALE` | Female RX weight/movement standards |
| `OPEN` | Gender-neutral / no preference |

> A member who identifies as non-binary can compete in the MALE or FEMALE category (or OPEN) — their choice has no dependency on `identifiedGender`.

---

## Result value shapes

`Result.value` is stored as `Json` and validated in the application layer via Zod (`packages/types/src/result.ts`). Shape varies by `WorkoutType`:

```ts
// AMRAP — rounds + reps completed within the time cap
{ type: 'AMRAP', rounds: number, reps: number }

// FOR_TIME — seconds to completion; cappedOut if time limit was hit
{ type: 'FOR_TIME', seconds: number, cappedOut: boolean }
```

Additional types (STRENGTH, EMOM, CARDIO, METCON) will be added to `packages/types` as those workout types are built out in later slices.

---

## Key design decisions

**Why is `Workout.level` removed?**
A workout *prescribes* standards per level in its description text (e.g. "RX: 95lb / Scaled: 65lb"). The level a member *actually performed at* is captured on their `Result`. Putting level on `Workout` would conflate the prescription with the performance.

**Why is `Program` many-to-many with `Gym`?**
Programming companies create one program and license it to multiple affiliates. A gym also typically runs several programs simultaneously (e.g. a strength cycle + an endurance track).

**Why is `Workout.programId` nullable?**
Members can log personal workouts that aren't part of any scheduled program — a workout they found online, a benchmark they want to track, etc.

**Why are `identifiedGender` and `workoutGender` separate?**
A user's self-identity is personal and has no bearing on which competitive category they enter. Keeping them separate ensures the system never makes assumptions or restrictions based on identity.
