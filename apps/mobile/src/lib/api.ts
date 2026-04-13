import * as SecureStore from 'expo-secure-store'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkoutType = 'STRENGTH' | 'FOR_TIME' | 'EMOM' | 'CARDIO' | 'AMRAP' | 'METCON' | 'WARMUP'
export type WorkoutStatus = 'DRAFT' | 'PUBLISHED'
export type WorkoutLevel = 'RX_PLUS' | 'RX' | 'SCALED' | 'MODIFIED'
export type WorkoutGender = 'MALE' | 'FEMALE' | 'OPEN'

export interface AuthUser {
  id: string
  email: string
  name: string
}

export interface Gym {
  id: string
  name: string
  slug: string
  timezone: string
  userRole: string
}

export interface Workout {
  id: string
  title: string
  description: string
  type: WorkoutType
  status: WorkoutStatus
  scheduledAt: string
  programId: string | null
}

export type ResultValue =
  | { type: 'AMRAP'; rounds: number; reps: number }
  | { type: 'FOR_TIME'; seconds: number; cappedOut?: boolean }

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

    loginWithGoogle: (idToken: string) =>
      request<{ accessToken: string; refreshToken: string; user: AuthUser }>('/api/auth/google/mobile', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      }),

    me: () =>
      request<AuthUser>('/api/auth/me'),
  },

  me: {
    gyms: () =>
      request<Gym[]>('/api/me/gyms'),

    results: (page = 1) =>
      request<{ results: ResultHistoryItem[]; total: number; page: number; totalPages: number }>(
        `/api/me/results?page=${page}&limit=20`,
      ),
  },

  gyms: {
    workouts: (gymId: string, from: string, to: string) =>
      request<Workout[]>(`/api/gyms/${gymId}/workouts?from=${from}&to=${to}`),
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
}
