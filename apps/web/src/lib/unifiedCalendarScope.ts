/**
 * ProgramScope for the unified calendar's create-workout flow (#268).
 *
 * Combines personal program + gym programs into a single scope so the
 * WorkoutDrawer can list both and route creates to the right endpoint.
 * Used as the *default* scope (for creating new workouts); existing workouts
 * are handled by `resolveScope` in WorkoutCalendarBoard (personal scope for
 * personal workouts, gym scope for gym workouts).
 */
import { api, type PersonalProgram, type Program, type Role } from './api'
import type { ProgramScope } from './programScope'
import { makeGymProgramScope } from './gymProgramScope'

function projectPersonalProgram(p: PersonalProgram): Program {
  const { ownerUserId: _, _count, ...rest } = p
  return { ...rest, _count: { members: 0, workouts: _count.workouts } }
}

interface UnifiedCalendarScopeOpts {
  gymId: string
  gymRole: Role | null
  personalProgram: PersonalProgram
}

export function makeUnifiedCalendarScope({
  gymId,
  gymRole,
  personalProgram,
}: UnifiedCalendarScopeOpts): ProgramScope {
  const gymScope = makeGymProgramScope({ gymId, gymRole })
  const personalProjected = projectPersonalProgram(personalProgram)
  const isStaff = gymRole !== null && gymRole !== 'MEMBER'

  return {
    kind: 'gym',
    capabilities: {
      // Personal program is always writable; gym write follows role.
      canWrite: true,
      canDelete: gymRole === 'OWNER',
      canSeeMembers: gymRole === 'OWNER' || gymRole === 'PROGRAMMER' || gymRole === 'COACH',
      canSetDefault: gymRole === 'OWNER',
    },

    list: async () => {
      // Personal is always first. Staff sees all gym programs; MEMBER only
      // sees subscribed programs — but for create purposes, we only need to
      // list personal for MEMBER (they can't write to gym programs anyway).
      if (!isStaff) return [personalProjected]
      const gymPrograms = await gymScope.list()
      return [personalProjected, ...gymPrograms]
    },

    get: (id) => {
      if (id === personalProgram.id) return Promise.resolve(personalProjected)
      return gymScope.get(id)
    },

    listWorkouts: () => Promise.resolve([]),

    createProgram: gymScope.createProgram,
    updateProgram: gymScope.updateProgram,
    deleteProgram: gymScope.deleteProgram,

    createWorkout: (programId, data) => {
      if (programId === personalProgram.id) {
        return api.me.personalProgram.workouts.create(data)
      }
      return api.workouts.create(gymId, { ...data, programId })
    },

    updateWorkout: gymScope.updateWorkout,
    publishWorkout: gymScope.publishWorkout,
    deleteWorkout: gymScope.deleteWorkout,

    setProgramAsDefault: gymScope.setProgramAsDefault,
    clearProgramDefault: gymScope.clearProgramDefault,
  }
}
