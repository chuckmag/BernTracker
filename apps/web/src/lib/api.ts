import { WORKOUT_TYPE_STYLES } from './workoutTypeStyles'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const REQUEST_TIMEOUT_MS = 10_000

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  // Chain an external abort signal (e.g. from useEffect cleanup) with the timeout
  init.signal?.addEventListener('abort', () => controller.abort())
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

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
  _refreshPromise = fetchWithTimeout(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
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

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })

  if (res.status === 401) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetchWithTimeout(`${BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
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

export interface Movement {
  id: string
  name: string
  parentId: string | null
}

export interface PendingMovement {
  id: string
  name: string
  status: 'PENDING'
  parentId: string | null
}

export type WorkoutType = 'STRENGTH' | 'FOR_TIME' | 'EMOM' | 'CARDIO' | 'AMRAP' | 'METCON' | 'WARMUP'
export type WorkoutCategory = 'GIRL_WOD' | 'HERO_WOD' | 'OPEN_WOD' | 'GAMES_WOD' | 'BENCHMARK'

/**
 * @deprecated Use `WORKOUT_TYPE_STYLES[type].abbr` from `./workoutTypeStyles`.
 * Retained as a shim so non-migrated callers keep working in one step.
 */
export const TYPE_ABBR: Record<WorkoutType, string> = {
  WARMUP:   WORKOUT_TYPE_STYLES.WARMUP.abbr,
  STRENGTH: WORKOUT_TYPE_STYLES.STRENGTH.abbr,
  AMRAP:    WORKOUT_TYPE_STYLES.AMRAP.abbr,
  FOR_TIME: WORKOUT_TYPE_STYLES.FOR_TIME.abbr,
  EMOM:     WORKOUT_TYPE_STYLES.EMOM.abbr,
  CARDIO:   WORKOUT_TYPE_STYLES.CARDIO.abbr,
  METCON:   WORKOUT_TYPE_STYLES.METCON.abbr,
}
export type WorkoutStatus = 'DRAFT' | 'PUBLISHED'

export interface NamedWorkout {
  id: string
  name: string
  category: WorkoutCategory
  aliases: string[]
  isActive: boolean
  templateWorkout: { id: string; type: WorkoutType; description: string; workoutMovements: { movement: Movement }[] } | null
}

export interface Workout {
  id: string
  title: string
  description: string
  type: WorkoutType
  status: WorkoutStatus
  scheduledAt: string
  dayOrder: number
  workoutMovements: { movement: Movement }[]
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

export type IdentifiedGender = 'FEMALE' | 'MALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | null

export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
  identifiedGender: IdentifiedGender
  isMovementReviewer: boolean
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

// Auth endpoints bypass `req()` because their 401s mean "wrong credentials"
// or "no session yet" — not "session expired" (which would trigger the
// unauthorized handler + refresh retry that `req()` does).
async function authPost<T>(path: string, body?: unknown, failMsg = 'Request failed'): Promise<T> {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? failMsg)
  return data as T
}

export const api = {
  auth: {
    // Full URL for the Google OAuth start endpoint. Not a fetch — the button
    // navigates to it with window.location / window.open.
    googleAuthUrl: (opts?: { prompt?: 'select_account' | 'consent' | 'none' }): string => {
      const params = new URLSearchParams()
      if (opts?.prompt) params.set('prompt', opts.prompt)
      const qs = params.toString()
      return `${BASE_URL}/api/auth/google${qs ? `?${qs}` : ''}`
    },
    register: (data: { name: string; email: string; password: string }) =>
      authPost<AuthResponse>('/api/auth/register', data, 'Registration failed'),
    login: (data: { email: string; password: string }) =>
      authPost<AuthResponse>('/api/auth/login', data, 'Login failed'),
    logout: () => authPost<void>('/api/auth/logout'),
    refresh: async (): Promise<{ accessToken: string } | null> => {
      try {
        return await authPost<{ accessToken: string }>('/api/auth/refresh')
      } catch {
        return null
      }
    },
    me: (token: string) => req<AuthUser>('/api/auth/me', { token }),
  },

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
    list: (gymId: string, from: string, to: string, movementIds?: string[], token?: string) => {
      const base = `/api/gyms/${gymId}/workouts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      const qs = movementIds?.length ? `&${movementIds.map((id) => `movementIds=${encodeURIComponent(id)}`).join('&')}` : ''
      return req<Workout[]>(`${base}${qs}`, { token })
    },

    create: (
      gymId: string,
      data: { programId?: string; title: string; description: string; type: WorkoutType; scheduledAt: string; movementIds?: string[]; namedWorkoutId?: string },
      token?: string,
    ) =>
      req<Workout>(`/api/gyms/${gymId}/workouts`, { method: 'POST', body: JSON.stringify(data), token }),

    update: (
      id: string,
      data: { title?: string; description?: string; type?: WorkoutType; scheduledAt?: string; dayOrder?: number; movementIds?: string[]; namedWorkoutId?: string | null },
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

    update: (
      resultId: string,
      data: { level?: WorkoutLevel; value?: Record<string, unknown>; notes?: string | null },
      token?: string,
    ) =>
      req<WorkoutResult>(`/api/results/${resultId}`, { method: 'PATCH', body: JSON.stringify(data), token }),

    delete: (resultId: string, token?: string) =>
      req<void>(`/api/results/${resultId}`, { method: 'DELETE', token }),

    history: (page = 1, movementIds?: string[], token?: string) => {
      const qs = movementIds?.length ? `&${movementIds.map((id) => `movementIds=${encodeURIComponent(id)}`).join('&')}` : ''
      return req<ResultHistoryPage>(`/api/me/results?page=${page}${qs}`, { token })
    },
  },

  movements: {
    list: (token?: string) =>
      req<Movement[]>('/api/movements', { token }),

    detect: (description: string, token?: string) =>
      req<Movement[]>('/api/movements/detect', {
        method: 'POST',
        body: JSON.stringify({ description }),
        token,
      }),

    suggest: (data: { name: string; parentId?: string }, token?: string) =>
      req<Movement>('/api/movements/suggest', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),

    pending: (token?: string) =>
      req<PendingMovement[]>('/api/movements/pending', { token }),

    update: (id: string, data: { name?: string; parentId?: string | null }, token?: string) =>
      req<PendingMovement>(`/api/movements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    review: (id: string, status: 'ACTIVE' | 'REJECTED', token?: string) =>
      req<Movement>(`/api/movements/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        token,
      }),
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
