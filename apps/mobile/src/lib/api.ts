import * as SecureStore from 'expo-secure-store'
import type {
  AgeDivision,
  IdentifiedGender,
  ResultValue,
  WorkoutGender,
  WorkoutLevel,
} from '@wodalytics/types'

export type { AgeDivision, IdentifiedGender, ResultValue, WorkoutGender, WorkoutLevel }
export { AGE_DIVISIONS, deriveWorkoutGender, getAgeDivision } from '@wodalytics/types'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://qa.wodalytics.com'
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
  firstName: string | null
  lastName: string | null
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

// User's private "Personal Program" (#183). Same Program shape with
// `ownerUserId` set, no GymProgram links, and PRIVATE visibility. The
// `_count.workouts` field is always populated since the page header reads it.
export interface PersonalProgram extends Program {
  ownerUserId: string
  _count: { workouts: number }
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

export interface DashboardTodayResult {
  id: string
  value: ResultValue
  level: WorkoutLevel
  workoutGender: WorkoutGender
  primaryScoreKind: string | null
  primaryScoreValue: number | null
  createdAt: string
  notes: string | null
}

export interface DashboardLeaderboard {
  rank: number | null
  totalLogged: number
  percentile: number | null
}

export interface DashboardToday {
  workout: (Workout & { program: { id: string; name: string } | null; namedWorkout: { id: string; name: string; category: string } | null; _count: { results: number } }) | null
  myResult: DashboardTodayResult | null
  leaderboard: DashboardLeaderboard | null
  gymMemberCount: number
  /** Subscribers to the hero workout's program via UserProgram. Used when isHeroWorkoutGymAffiliated is false. */
  programSubscriberCount: number
  /** False for unaffiliated programs (e.g. CrossFit Mainsite) — use programSubscriberCount for the social count. */
  isHeroWorkoutGymAffiliated: boolean
}

export interface LeaderboardEntry {
  id: string
  user: { id: string; name: string; birthday: string | null }
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

export type MovementCategory = 'STRENGTH' | 'ENDURANCE' | 'MACHINE' | 'GYMNASTICS' | 'SKILL'

export interface MovementHistorySet {
  reps?: string
  load?: number
  distance?: number
  distanceUnit?: string
  calories?: number
  seconds?: number
}

export interface MovementHistoryResult {
  id: string
  workout: { id: string; title: string; type: WorkoutType; scheduledAt: string }
  level: WorkoutLevel
  loadUnit?: string
  distanceUnit?: string
  movementSets: MovementHistorySet[]
}

export interface StrengthPrEntry {
  reps: number
  maxLoad: number
  unit: string
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface EndurancePrEntry {
  distance: number
  distanceUnit: string
  bestSeconds: number
  workoutId: string
  resultId: string
  workoutScheduledAt: string
}

export interface MovementHistoryPage {
  movementId: string
  movementName: string
  category: MovementCategory
  prTable:
    | { category: 'STRENGTH'; entries: StrengthPrEntry[] }
    | { category: 'ENDURANCE'; entries: EndurancePrEntry[] }
    | { category: 'MACHINE'; outputCapped: { calories: unknown[]; distance: unknown[] }; timeCapped: { calories: unknown[]; distance: unknown[] } }
    | { category: 'GYMNASTICS' | 'SKILL'; entries: never[] }
  results: MovementHistoryResult[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface LogResultInput {
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: ResultValue
  notes?: string
}

export interface ConsistencyData {
  currentStreak: number
  longestStreak: number
  history: { date: string; count: number }[]
}

export interface TrackedMovement {
  movementId: string
  name: string
  count: number
}

export interface StrengthTrajectoryPoint {
  date: string
  maxLoad: number
  loadUnit: string
  effort: string
  workoutId: string
  resultId: string
}

export interface StrengthTrajectoryData {
  movementId: string
  name: string
  currentPr: number | null
  loadUnit: string | null
  points: StrengthTrajectoryPoint[]
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

    personalProgram: {
      // Returns the caller's private "Personal Program" (#183), creating it on
      // first call. Idempotent — repeat calls return the existing row.
      get: () =>
        request<PersonalProgram>('/api/me/personal-program'),

      workouts: {
        // Date range optional; without it every workout in the program is
        // returned. The mobile feed currently routes through
        // `/api/gyms/:gymId/workouts` (which already includes unaffiliated
        // programs the caller subscribes to), so the dedicated personal-program
        // list is only used by the future personal-program calendar screen.
        list: (range?: { from: string; to: string }) => {
          const qs = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ''
          return request<Workout[]>(`/api/me/personal-program/workouts${qs}`)
        },
        // Body matches `api.workouts.create` minus `programId`, which the
        // server pins to the caller's personal program (and strips before
        // validating, so a spoofed value can't escape).
        create: (data: {
          title: string
          description: string
          type: WorkoutType
          scheduledAt: string
          movementIds?: string[]
        }) =>
          request<Workout>('/api/me/personal-program/workouts', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      },
    },

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
    dashboard: {
      today: (gymId: string, programIds?: string[]) => {
        const qs = programIds?.length ? `?programIds=${programIds.join(',')}` : ''
        return request<DashboardToday>(`/api/gyms/${gymId}/dashboard/today${qs}`)
      },
    },

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

  movements: {
    myHistory: (movementId: string, page = 1, limit = 10) =>
      request<MovementHistoryPage>(
        `/api/movements/${encodeURIComponent(movementId)}/my-history?page=${page}&limit=${limit}`,
      ),
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

  analytics: {
    consistency: (weeks?: number) => {
      const qs = weeks ? `?weeks=${weeks}` : ''
      return request<ConsistencyData>(`/api/me/analytics/consistency${qs}`)
    },
    trackedMovements: (days = 60, limit = 5) =>
      request<TrackedMovement[]>(`/api/me/analytics/tracked-movements?days=${days}&limit=${limit}`),
    strengthTrajectory: (movementId: string, range: '1M' | '3M' | '6M' | '1Y') =>
      request<StrengthTrajectoryData>(`/api/me/analytics/strength-trajectory?movementId=${encodeURIComponent(movementId)}&range=${range}`),
  },
}
