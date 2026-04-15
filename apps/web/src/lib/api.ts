const BASE_URL = import.meta.env.VITE_API_URL ?? ''

let _onUnauthorized: (() => void) | null = null
let _accessToken: string | null = null

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler
}

export function setAccessToken(token: string | null) {
  _accessToken = token
}

let _refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => {
      if (!r.ok) return null
      return r.json().then((d) => {
        const newToken = d.accessToken as string
        _accessToken = newToken
        return newToken
      })
    })
    .catch(() => null)
    .finally(() => { _refreshPromise = null })
  return _refreshPromise
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<Response> {
  const { token, ...init } = options
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const bearer = token ?? _accessToken
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`)

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetch(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
    }
  }

  return res
}

async function req<T>(path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await apiFetch(path, opts)
  if (res.status === 401) {
    _onUnauthorized?.()
    throw new Error('Session expired. Please log in again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

export type Role = 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER'
export type WorkoutType = 'STRENGTH' | 'FOR_TIME' | 'EMOM' | 'CARDIO' | 'AMRAP' | 'METCON' | 'WARMUP'
export type WorkoutCategory = 'GIRL_WOD' | 'HERO_WOD' | 'OPEN_WOD' | 'GAMES_WOD' | 'BENCHMARK'

export const TYPE_ABBR: Record<WorkoutType, string> = {
  WARMUP: 'W',
  STRENGTH: 'S',
  AMRAP: 'A',
  FOR_TIME: 'F',
  EMOM: 'E',
  CARDIO: 'C',
  METCON: 'M',
}
export type WorkoutStatus = 'DRAFT' | 'PUBLISHED'

export interface NamedWorkout {
  id: string
  name: string
  category: WorkoutCategory
  aliases: string[]
  isActive: boolean
  templateWorkout: { id: string; type: WorkoutType; description: string; movements: string[] } | null
}

export interface Workout {
  id: string
  title: string
  description: string
  type: WorkoutType
  status: WorkoutStatus
  scheduledAt: string
  dayOrder: number
  movements: string[]
  programId: string | null
  program: { id: string; name: string } | null
  namedWorkoutId: string | null
  namedWorkout: { id: string; name: string; category: WorkoutCategory } | null
  _count: { results: number }
  createdAt: string
  updatedAt: string
}

export type WorkoutLevel = 'RX_PLUS' | 'RX' | 'SCALED' | 'MODIFIED'
export type WorkoutGender = 'MALE' | 'FEMALE' | 'OPEN'

export interface WorkoutResult {
  id: string
  userId: string
  workoutId: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: Record<string, unknown>
  notes: string | null
  createdAt: string
  user: { id: string; name: string | null }
  workout: { type: WorkoutType }
}

export interface HistoryResult extends Omit<WorkoutResult, 'workout'> {
  workout: { id: string; title: string; type: WorkoutType; scheduledAt: string }
}

export interface ResultHistoryPage {
  results: HistoryResult[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface MyGym {
  id: string
  name: string
  slug: string
  role: Role
}

export interface Gym {
  id: string
  name: string
  slug: string
  timezone: string
  createdAt: string
  updatedAt: string
}

export interface Member {
  id: string
  email: string
  name: string | null
  role: Role
  joinedAt: string
  programs: { id: string; name: string }[]
}

export interface Program {
  id: string
  name: string
  description?: string
  startDate: string
  endDate?: string
  createdAt: string
  updatedAt: string
}

export interface GymProgram {
  gymId: string
  programId: string
  createdAt: string
  program: Program
}

export const api = {
  me: {
    gyms: () => req<MyGym[]>('/api/me/gyms'),
  },

  gyms: {
    create: (data: { name: string; timezone?: string }, token?: string) =>
      req<Gym>('/api/gyms', { method: 'POST', body: JSON.stringify(data), token }),

    get: (id: string, token?: string) => req<Gym>(`/api/gyms/${id}`, { token }),

    update: (id: string, data: { name?: string; timezone?: string }, token?: string) =>
      req<Gym>(`/api/gyms/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

    members: {
      list: (gymId: string, token?: string) =>
        req<Member[]>(`/api/gyms/${gymId}/members`, { token }),

      invite: (gymId: string, data: { email: string; role?: Role }, token?: string) =>
        req<Member>(`/api/gyms/${gymId}/members/invite`, {
          method: 'POST',
          body: JSON.stringify(data),
          token,
        }),

      updateRole: (gymId: string, userId: string, role: Role, token?: string) =>
        req<unknown>(`/api/gyms/${gymId}/members/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
          token,
        }),

      remove: (gymId: string, userId: string, token?: string) =>
        req<void>(`/api/gyms/${gymId}/members/${userId}`, { method: 'DELETE', token }),
    },

    programs: {
      list: (gymId: string, token?: string) =>
        req<GymProgram[]>(`/api/gyms/${gymId}/programs`, { token }),

      create: (gymId: string, data: { name: string; description?: string; startDate: string; endDate?: string }, token?: string) =>
        req<{ program: Program }>(`/api/gyms/${gymId}/programs`, {
          method: 'POST',
          body: JSON.stringify(data),
          token,
        }),
    },
  },

  workouts: {
    list: (gymId: string, from: string, to: string, token?: string) =>
      req<Workout[]>(`/api/gyms/${gymId}/workouts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token }),

    create: (
      gymId: string,
      data: { programId?: string; title: string; description: string; type: WorkoutType; scheduledAt: string; movements?: string[]; namedWorkoutId?: string },
      token?: string,
    ) =>
      req<Workout>(`/api/gyms/${gymId}/workouts`, { method: 'POST', body: JSON.stringify(data), token }),

    update: (
      id: string,
      data: { title?: string; description?: string; type?: WorkoutType; scheduledAt?: string; dayOrder?: number; movements?: string[]; namedWorkoutId?: string | null },
      token?: string,
    ) =>
      req<Workout>(`/api/workouts/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

    get: (id: string, token?: string) =>
      req<Workout>(`/api/workouts/${id}`, { token }),

    publish: (id: string, token?: string) =>
      req<Workout>(`/api/workouts/${id}/publish`, { method: 'POST', token }),

    delete: (id: string, token?: string) =>
      req<void>(`/api/workouts/${id}`, { method: 'DELETE', token }),

    applyTemplate: (id: string, token?: string) =>
      req<Workout>(`/api/workouts/${id}/apply-template`, { method: 'POST', token }),
  },

  namedWorkouts: {
    list: (token?: string) =>
      req<NamedWorkout[]>('/api/named-workouts', { token }),

    get: (id: string, token?: string) =>
      req<NamedWorkout>(`/api/named-workouts/${id}`, { token }),

    create: (
      data: { name: string; category: WorkoutCategory; aliases?: string[]; template?: { type: WorkoutType; description: string; movements?: string[] } },
      token?: string,
    ) =>
      req<NamedWorkout>('/api/named-workouts', { method: 'POST', body: JSON.stringify(data), token }),

    update: (
      id: string,
      data: { name?: string; category?: WorkoutCategory; aliases?: string[]; isActive?: boolean; templateWorkoutId?: string | null },
      token?: string,
    ) =>
      req<NamedWorkout>(`/api/named-workouts/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
  },

  results: {
    leaderboard: (workoutId: string, token?: string) =>
      req<WorkoutResult[]>(`/api/workouts/${workoutId}/results`, { token }),

    create: (
      workoutId: string,
      data: { level: WorkoutLevel; workoutGender: WorkoutGender; value: Record<string, unknown>; notes?: string },
      token?: string,
    ) =>
      apiFetch(`/api/workouts/${workoutId}/results`, { method: 'POST', body: JSON.stringify(data), token }),

    history: (page = 1, token?: string) =>
      req<ResultHistoryPage>(`/api/me/results?page=${page}`, { token }),
  },

  programs: {
    subscribe: (id: string, userId: string, token?: string) =>
      req<unknown>(`/api/programs/${id}/subscribe`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
        token,
      }),

    unsubscribe: (id: string, userId: string, token?: string) =>
      req<void>(`/api/programs/${id}/subscribe`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
        token,
      }),
  },
}
