/**
 * `ProgramScope` implementation for the WODalytics admin surface (#160).
 * Wires the admin REST namespace into the shared program/workout components.
 *
 * Capabilities are static here: an authenticated admin (verified server-side
 * by `requireWodalyticsAdmin`) has full read+write+delete on every
 * unaffiliated program. The members tab and gym-default toggles are gym
 * concepts and are deliberately off so the shared components hide them.
 */
import { api } from './api'
import type { ProgramScope } from './programScope'

export const adminProgramScope: ProgramScope = {
  kind: 'admin',
  capabilities: {
    canWrite: true,
    canDelete: true,
    canSeeMembers: false,
    canSetDefault: false,
  },
  list: () => api.admin.programs.list(),
  get: (id) => api.admin.programs.get(id),
  listWorkouts: (programId) => api.admin.programs.listWorkouts(programId),
}
