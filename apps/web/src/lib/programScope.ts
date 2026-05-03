/**
 * ProgramScope — the contract that lets the same program / workout editing
 * components serve both the gym-scoped path (`/programs/:id`) and the
 * WODalytics admin path (`/admin/programs/:id`). Spec lives in #160.
 *
 * **Hard requirement (#160):** there must be exactly one set of editor
 * components. The two routes mount the same components with different
 * scope implementations — the components only see the scope interface, not
 * gym vs admin specifics.
 *
 * Slice 2 established the read-only surface (list / get / listWorkouts).
 * Slice 3 (this file's expanded contract) adds mutations: programs and
 * workouts CRUD. Both editor components — `ProgramFormDrawer` and
 * `WorkoutDrawer` — consume this interface; their two consumer routes
 * pass a `gymProgramScope` (built from the active gym + role) or the
 * singleton `adminProgramScope`.
 */
import type { Program, ProgramVisibility, Workout, WorkoutMovementInput, WorkoutType } from './api'

export type ProgramScopeKind = 'gym' | 'admin'

export interface ProgramScopeCapabilities {
  canWrite: boolean
  canDelete: boolean
  canSeeMembers: boolean
  canSetDefault: boolean
}

// Shapes mirror the existing api.ts client signatures so the scope is a
// drop-in over them — keeps the editor components free of conversion logic.
export interface CreateProgramScopeData {
  name: string
  description?: string
  startDate: string
  endDate?: string
  // No nullable form on create — to leave a field unset, omit it. The
  // admin client's `create` accepts `string | null` but normalizes null to
  // undefined; this tighter type keeps consumers honest.
  coverColor?: string
  visibility?: ProgramVisibility
}

export interface UpdateProgramScopeData {
  name?: string
  description?: string | null
  startDate?: string
  endDate?: string | null
  coverColor?: string | null
  visibility?: ProgramVisibility
}

export interface CreateWorkoutScopeData {
  title: string
  description: string
  type: WorkoutType
  scheduledAt: string
  movementIds?: string[]
  movements?: WorkoutMovementInput[]
  namedWorkoutId?: string
  timeCapSeconds?: number | null
  tracksRounds?: boolean
}

export interface UpdateWorkoutScopeData {
  title?: string
  description?: string
  type?: WorkoutType
  scheduledAt?: string
  dayOrder?: number
  movementIds?: string[]
  movements?: WorkoutMovementInput[]
  namedWorkoutId?: string | null
  timeCapSeconds?: number | null
  tracksRounds?: boolean
}

export interface ProgramScope {
  kind: ProgramScopeKind
  /**
   * Caller-relative capability flags. The components keying off these are
   * authoritative for hiding affordances; the API still enforces auth on
   * every mutating call.
   */
  capabilities: ProgramScopeCapabilities

  // Read (slice 2)
  list(): Promise<Program[]>
  get(id: string): Promise<Program>
  listWorkouts(programId: string): Promise<Workout[]>

  // Program mutations (slice 3)
  createProgram(data: CreateProgramScopeData): Promise<Program>
  updateProgram(id: string, data: UpdateProgramScopeData): Promise<Program>
  deleteProgram(id: string): Promise<void>

  // Workout mutations (slice 3)
  createWorkout(programId: string, data: CreateWorkoutScopeData): Promise<Workout>
  updateWorkout(workoutId: string, data: UpdateWorkoutScopeData): Promise<Workout>
  deleteWorkout(workoutId: string): Promise<void>

  // Gym-only affordances. Optional on the contract so the admin scope can
  // omit them entirely; consumers must check both `capabilities.canSetDefault`
  // AND method presence before calling.
  setProgramAsDefault?(programId: string): Promise<void>
  clearProgramDefault?(programId: string): Promise<void>
}
