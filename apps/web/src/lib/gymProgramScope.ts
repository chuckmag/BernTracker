/**
 * `ProgramScope` implementation for the gym-scoped pages (#160). Wraps the
 * existing gym-aware REST client so the same `ProgramFormDrawer` and
 * `WorkoutDrawer` components serve both gym staff and WODalytics admins.
 *
 * Capabilities are derived from the caller's gym role. Gym-default toggle
 * and members visibility are gym-only concepts; they're absent from the
 * admin scope. The actual gym-default toggle still lives in
 * `ProgramFormDrawer`'s gym-only render branch — this scope only carries
 * the capability flags so the component knows what to show.
 */
import { api, type Role } from './api'
import type { ProgramScope } from './programScope'

interface GymScopeOpts {
  gymId: string
  gymRole: Role | null
}

export function makeGymProgramScope({ gymId, gymRole }: GymScopeOpts): ProgramScope {
  const isStaff = gymRole === 'OWNER' || gymRole === 'PROGRAMMER'
  const canSeeMembers = isStaff || gymRole === 'COACH'
  return {
    kind: 'gym',
    capabilities: {
      canWrite: isStaff,
      canDelete: gymRole === 'OWNER',
      canSeeMembers,
      canSetDefault: gymRole === 'OWNER',
    },

    list: () => api.gyms.programs.list(gymId).then((rows) => rows.map((r) => r.program)),
    get: (id) => api.programs.get(id).then((row) => row.program),
    // Gym-scoped programs surface their workouts through the gym-day-range
    // endpoint, not a per-program list — so this method is a no-op here.
    // Slice 4 (when the gym path adopts shared workout-list components)
    // will resolve this; for slice 3, only the admin path calls
    // listWorkouts, so the gym implementation can stay unimplemented.
    listWorkouts: () => Promise.resolve([]),

    createProgram: async (data) => {
      const { program } = await api.gyms.programs.create(gymId, data)
      return program
    },
    updateProgram: (id, data) => api.programs.update(id, data),
    deleteProgram: (id) => api.programs.delete(id),

    createWorkout: (programId, data) =>
      api.workouts.create(gymId, { ...data, programId }),
    updateWorkout: (workoutId, data) => api.workouts.update(workoutId, data),
    publishWorkout: (workoutId) => api.workouts.publish(workoutId),
    deleteWorkout: (workoutId) => api.workouts.delete(workoutId),

    setProgramAsDefault: (programId) => api.gyms.programs.setDefault(gymId, programId),
    clearProgramDefault: (programId) => api.gyms.programs.clearDefault(gymId, programId),
  }
}
