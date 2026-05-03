import * as SecureStore from 'expo-secure-store'
import type {
  IdentifiedGender,
  ResultValue,
  WorkoutGender,
  WorkoutLevel,
} from '@wodalytics/types'

export type { IdentifiedGender, ResultValue, WorkoutGender, WorkoutLevel }
export { deriveWorkoutGender } from '@wodalytics/types'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkoutType =
  // Strength
  | 'STRENGTH' | 'POWER_LIFTING' | 'WEIGHT_LIFTING' | 'BODY_BUILDING' | 'MAX_EFFORT'
  // Metcon
  | 'AMRAP' | 'FOR_TIME' | 'EMOM' | 'METCON' | 'TABATA' | 'INTERVALS' | 'CHIPPER' | 'LADDER' | 'DEATH_BY'
  // MonoStructural
  | 'CARDIO' | 'RUNNING' | 'ROWING' | 'BIKING' | 'SWIMMING' | 'SKI_ERG' | 'MIXED_MONO'
  // Skill Work
  | 'GYMNASTICS' | 'WEIGHTLIFTING_TECHNIQUE'
  // Warmup / Recovery
  | 'WARMUP' | 'MOBILITY' | 'COOLDOWN'
export type WorkoutStatus = 'DRAFT' | 'PUBLISHED'

// Per-movement prescription on a workout. All prescription fields are
// nullable — programmer fills only the columns relevant to the workout.
// Mirrors the web's `WorkoutMovementWithPrescription`.
export type LoadUnit = 'LB' | 'KG'
export type DistanceUnit = 'M' | 'KM' | 'MI' | 'FT' | 'YD'

export interface Movement {
  id: string
  name: string
  parentId: string | null
}

export interface WorkoutMovementWithPrescription {
  movement: Movement
  displayOrder: number
  sets: number | null
  reps: string | null
  load: number | null
  loadUnit: LoadUnit | null
  // Whether the result form should surface a Load column for this movement.
  // Always populated on read — the Prisma column has `@default(true)`. Programmer
  // flips this off for plyometric supersets and other no-load movements where a
  // Load column would just be noise.
  tracksLoad: boolean
  tempo: string | null
  distance: number | null
  distanceUnit: DistanceUnit | null
  calories: number | null
  seconds: number | null
}

export type Role = 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER'

export interface AuthUser {
  id: string
  email: string
  name: string
  identifiedGender: IdentifiedGender | null
}

export interface Gym {
  id: string
  name: string
  slug: string
  timezone: string
  // The caller's membership role within this gym. Mirrors what
  // GET /api/me/gyms returns (see findGymMembershipsByUserId in the API).
  role: Role
}

export interface Program {
  id: string
  name: string
  description: string | null
  visibility: 'PUBLIC' | 'PRIVATE'
  coverColor: string | null
}

// Mirrors the web `GymProgram` shape (apps/web/src/lib/api.ts): the join row
// carries gym/program IDs and the nested `program` object holds the
// human-facing fields (name, description, etc.).
export interface GymProgram {
  gymId: string
  programId: string
  isDefault: boolean
  program: Program
}

export interface Workout {
  id: string
  title: string
  description: string
  // Optional programmer-authored stimulus / teaching notes (#184). Nullable
  // on read; mobile only displays it (no authoring surface yet — #130).
  coachNotes?: string | null
  type: WorkoutType
  status: WorkoutStatus
  scheduledAt: string
  programId: string | null
  workoutMovements: WorkoutMovementWithPrescription[]
  timeCapSeconds: number | null
  tracksRounds: boolean
  externalSourceId: string | null
}

export interface LeaderboardEntry {
  id: string
  user: { id: string; name: string }
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: ResultValue
  notes: string | null
  createdAt: string
}

export interface ResultHistoryItem {
  id: string
  workout: {
    id: string
    title: string
    type: WorkoutType
    scheduledAt: string
  }
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: ResultValue
  notes: string | null
  createdAt: string
}

export interface LogResultInput {
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: ResultValue
  notes?: string
}

// ── Token storage ────────────────────────────────────────────────────────────

export async function storeTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken)
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken)
}

export async function getStoredTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ])
  return { accessToken, refreshToken }
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
}

// ── HTTP client ──────────────────────────────────────────────────────────────

let _accessToken: string | null = null
let _onUnauthorized: (() => void) | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    // Attempt token refresh
    const { refreshToken } = await getStoredTokens()
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        _accessToken = data.accessToken
        await storeTokens(data.accessToken, refreshToken)
        return request<T>(path, options, false)
      }
    }
    _onUnauthorized?.()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error ?? `HTTP ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// ── API methods ──────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ accessToken: string; refreshToken: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),

    me: () =>
      request<AuthUser>('/api/auth/me'),
  },

  me: {
    gyms: () =>
      request<Gym[]>('/api/me/gyms'),

    programs: (gymId: string) =>
      request<GymProgram[]>(`/api/me/programs?gymId=${encodeURIComponent(gymId)}`),

    results: (page = 1, movementIds?: string[]) => {
      const qs = new URLSearchParams({ page: String(page), limit: '20' })
      if (movementIds?.length) qs.set('movementIds', movementIds.join(','))
      return request<{
        results: ResultHistoryItem[]
        total: number
        page: number
        limit: number
        pages: number
      }>(`/api/me/results?${qs}`)
    },
  },

  gyms: {
    workouts: (gymId: string, from: string, to: string, programIds?: string[]) => {
      const qs = new URLSearchParams({ from, to })
      if (programIds?.length) qs.set('programIds', programIds.join(','))
      return request<Workout[]>(`/api/gyms/${gymId}/workouts?${qs}`)
    },
  },

  workouts: {
    get: (id: string) =>
      request<Workout>(`/api/workouts/${id}`),

    results: (workoutId: string, level?: WorkoutLevel) => {
      const qs = level ? `?level=${level}` : ''
      return request<LeaderboardEntry[]>(`/api/workouts/${workoutId}/results${qs}`)
    },

    logResult: (workoutId: string, data: LogResultInput) =>
      request<LeaderboardEntry>(`/api/workouts/${workoutId}/results`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  results: {
    update: (
      resultId: string,
      data: { level?: WorkoutLevel; value?: ResultValue; notes?: string | null },
    ) =>
      request<LeaderboardEntry>(`/api/results/${resultId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (resultId: string) =>
      request<void>(`/api/results/${resultId}`, { method: 'DELETE' }),
  },
}
