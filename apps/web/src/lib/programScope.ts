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
 * Slice 2 (this slice) establishes the read-only surface — list, get,
 * listWorkouts — and only the admin path uses it. The gym-scoped pages
 * still call the `api.gyms.*` / `api.programs.*` clients directly. Slice 3
 * grows the contract with mutations (`updateProgram`, `createWorkout`,
 * `updateWorkout`, `deleteWorkout`, ...) and migrates the gym-scoped pages
 * onto it as a side-effect of building the shared editor.
 */
import type { Program, Workout } from './api'

export type ProgramScopeKind = 'gym' | 'admin'

export interface ProgramScopeCapabilities {
  canWrite: boolean
  canDelete: boolean
  canSeeMembers: boolean
  canSetDefault: boolean
}

export interface ProgramScope {
  kind: ProgramScopeKind
  /**
   * Caller-relative capability flags. The components keying off these are
   * authoritative for hiding affordances; the API still enforces auth on
   * every mutating call.
   */
  capabilities: ProgramScopeCapabilities
  list(): Promise<Program[]>
  get(id: string): Promise<Program>
  listWorkouts(programId: string): Promise<Workout[]>
}
