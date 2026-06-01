import type { ResultValue, WorkoutLevel, WorkoutGender } from './result.js'
import type { WorkoutType, WorkoutCategory } from './workout.js'
import type { MovementCategory, MovementPrType } from './movement.js'

// ── PR entry types ────────────────────────────────────────────────────────────

export interface StrengthPrEntry {
  reps: number
  maxLoad: number
  unit: string
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MaxRepsPrEntry {
  maxReps: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface EndurancePrEntry {
  distance: number
  distanceUnit: string
  bestSeconds: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MachinePrCalEntry {
  calories: number
  bestSeconds: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MachinePrDistEntry {
  distance: number
  distanceUnit: string
  bestSeconds: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MachineTimeCapCalEntry {
  seconds: number
  bestCalories: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MachineTimeCapDistEntry {
  seconds: number
  bestDistance: number
  distanceUnit: string
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

// Discriminated union over all PR entry shapes, keyed by movement category
export type MovementPrTable =
  | { category: 'STRENGTH'; entries: StrengthPrEntry[] }
  | { category: 'ENDURANCE' | 'MONOSTRUCTURAL'; entries: EndurancePrEntry[] }
  | { category: 'GYMNASTICS' | 'SKILL'; entries: MaxRepsPrEntry[] | never[] }
  | { category: 'MACHINE'; outputCapped: { calories: MachinePrCalEntry[]; distance: MachinePrDistEntry[] }; timeCapped: { calories: MachineTimeCapCalEntry[]; distance: MachineTimeCapDistEntry[] } }

// ── Movement history ──────────────────────────────────────────────────────────

export interface MovementHistorySet {
  reps?: string
  load?: number
  seconds?: number
  distance?: number
  distanceUnit?: string
  calories?: number
  tempo?: string
}

export interface MovementHistoryResult {
  id: string
  createdAt: string
  level: WorkoutLevel
  notes: string | null
  workout: { id: string; title: string; type: WorkoutType; scheduledAt: string }
  movementSets: MovementHistorySet[]
  loadUnit?: string
  distanceUnit?: string
}

export interface MovementHistoryPage {
  movementId: string
  movementName: string
  category: MovementCategory
  prTypes: MovementPrType[]
  prTable: MovementPrTable
  results: MovementHistoryResult[]
  total: number
  page: number
  limit: number
  pages: number
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

export interface BenchmarkResult {
  id: string
  userId: string
  namedWorkoutName: string
  achievedAt: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: object
  notes: string | null
  primaryScoreKind: string | null
  primaryScoreValue: number | null
  createdAt: string
  updatedAt: string
}

// ── Named workouts ────────────────────────────────────────────────────────────

// Minimal movement shape as returned by the named-workout API response.
// This is a simpler subset of the full MovementSchema (no status, sourceUrl, etc.)
// used inside NamedWorkout.templateWorkout.
export interface NamedWorkoutMovement {
  id: string
  name: string
  parentId: string | null
  aliases: string[]
}

export interface NamedWorkout {
  id: string
  name: string
  category: WorkoutCategory
  aliases: string[]
  isActive: boolean
  description: string | null
  sourceUrl: string | null
  templateWorkout: {
    id: string
    type: WorkoutType
    description: string
    workoutMovements: { movement: NamedWorkoutMovement }[]
  } | null
}

// ── Benchmark summary / history ───────────────────────────────────────────────

// One row in the /api/me/benchmarks list response.
export interface BenchmarkSummaryEntry extends NamedWorkout {
  manualResultCount: number
  latestResult: BenchmarkResult | null
}

// One entry in the /api/me/benchmarks/:id history response.
export interface BenchmarkHistoryEntry {
  source: 'manual' | 'programmed'
  id: string
  achievedAt: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: object
  notes: string | null
  primaryScoreKind: string | null
  primaryScoreValue: number | null
  createdAt: string
  updatedAt?: string
  workoutId?: string
}

export interface BenchmarkHistoryData {
  namedWorkout: NamedWorkout
  history: BenchmarkHistoryEntry[]
}

// ── Dashboard "today" ─────────────────────────────────────────────────────────
//
// GET /api/gyms/:gymId/dashboard/today response. Web and mobile both consume it,
// so the shared parts live here. The `workout` payload itself is structurally
// the same on both surfaces (includes program, namedWorkout, _count) but each
// app's local `Workout` interface differs — web's is fuller (dayOrder, etc.),
// mobile's is leaner — so `DashboardTodayWorkout` and `DashboardToday` are
// parameterized by `TWorkout` and each surface instantiates with its own
// `Workout` extended with the include shape.

export interface DashboardLeaderboard {
  rank: number | null
  totalLogged: number
  percentile: number | null
}

export interface DashboardTodayResult {
  id: string
  value: ResultValue
  level: WorkoutLevel
  workoutGender: WorkoutGender
  primaryScoreKind: string | null
  primaryScoreValue: number | null
  createdAt: string
  notes: string | null
}

export interface DashboardTodayWorkout<TWorkout = unknown> {
  workout: TWorkout
  myResult: DashboardTodayResult | null
  leaderboard: DashboardLeaderboard | null
  /** Subscribers to this workout's program via UserProgram. Used when isHeroWorkoutGymAffiliated is false. */
  programSubscriberCount: number
  /** False for unaffiliated programs (e.g. CrossFit Mainsite) — use programSubscriberCount for the social count. */
  isHeroWorkoutGymAffiliated: boolean
}

export interface DashboardToday<TWorkout = unknown> {
  /** All published workouts for today, recovery (warmup/mobility/cooldown) first. Frontend pre-selects the first non-recovery entry as the default active tab. */
  workouts: DashboardTodayWorkout<TWorkout>[]
  gymMemberCount: number
}
