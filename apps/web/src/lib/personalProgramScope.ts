/**
 * `ProgramScope` implementation for a user's private Personal Program (#183).
 * The factory closes over the resolved program id so the scope can route
 * `list` / `get` / `listWorkouts` / `createWorkout` through the
 * `/api/me/personal-program*` endpoints without callers needing to thread
 * the id manually.
 *
 * Behaves like the admin scope at the drawer level: one Save button, no
 * DRAFT/PUBLISHED concept (a personal workout has no audience), and no
 * gym-default toggle. The drawer keys those off `kind: 'personal'` exactly
 * the way it currently keys off `kind: 'admin'`.
 */
import { api, type PersonalProgram, type Program } from './api'
import type { ProgramScope } from './programScope'

interface PersonalScopeOpts {
  program: PersonalProgram
}

// Strip the personal-program-specific fields when projecting back into the
// shared Program shape so the scope's contract matches `gymProgramScope`.
function toProgram(p: PersonalProgram): Program {
  const { ownerUserId: _ownerUserId, _count, ...rest } = p
  return { ...rest, _count: { members: 0, workouts: _count.workouts } }
}

export function makePersonalProgramScope({ program }: PersonalScopeOpts): ProgramScope {
  const projected = toProgram(program)

  return {
    kind: 'personal',
    capabilities: {
      // The user can always edit their own private program.
      canWrite: true,
      canDelete: true,
      // No members on a one-user program.
      canSeeMembers: false,
      // Personal programs aren't gym defaults.
      canSetDefault: false,
    },

    // The drawer's program picker only renders for `kind: 'gym'`; for personal
    // it's a read-only label. `list()` is still called by the picker effect,
    // so return the single pinned program as a one-element list to keep the
    // contract consistent.
    list: () => Promise.resolve([projected]),
    get: (id) => {
      if (id !== program.id) return Promise.reject(new Error('Personal scope: program id mismatch'))
      return Promise.resolve(projected)
    },

    // The personal-program calendar uses a separate per-month, date-ranged
    // loader (see `WorkoutCalendarBoard.loadWorkouts`). This contract method
    // is only hit by code paths the personal page doesn't traverse, but it's
    // still wired correctly: returns every workout in the program.
    listWorkouts: (programId) => {
      if (programId !== program.id) return Promise.resolve([])
      return api.me.personalProgram.workouts.list()
    },

    // Personal programs aren't created or destroyed through this surface —
    // the API upserts on first GET and a delete is out of scope. These would
    // only fire if someone misuses the scope; throw rather than silently
    // hitting the wrong endpoint.
    createProgram: () => Promise.reject(new Error('Personal Program is auto-created; cannot create another')),
    updateProgram: () => Promise.reject(new Error('Personal Program metadata is not editable from this surface')),
    deleteProgram: () => Promise.reject(new Error('Personal Program cannot be deleted')),

    createWorkout: async (programId, data) => {
      if (programId !== program.id) {
        throw new Error('Personal scope: cannot create a workout in another program')
      }
      // The server strips `programId` from the body and pins it to the
      // caller's program; we still pass through every field the server
      // accepts. The shared `CreateWorkoutScopeData` shape carries
      // `coachNotes`, but the personal endpoint forwards the same payload
      // so it's preserved when the API supports it.
      return api.me.personalProgram.workouts.create(data)
    },
    updateWorkout: (workoutId, data) => api.workouts.update(workoutId, data),
    // Personal workouts auto-publish on create; this is never reached from the
    // UI (guarded by isGymScope), but satisfies the ProgramScope contract.
    publishWorkout: (workoutId) => api.workouts.publish(workoutId),
    deleteWorkout: (workoutId) => api.workouts.delete(workoutId),

    // Personal programs aren't gym defaults — leave the optional methods
    // off, exactly like the admin scope does.
  }
}
