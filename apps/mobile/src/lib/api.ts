import * as SecureStore from 'expo-secure-store'
import type {
  AgeDivision,
  IdentifiedGender,
  ResultValue,
  WorkoutGender,
  WorkoutLevel,
  Role,
  WorkoutStatus,
  MovementCategory,
  MovementPrType,
  MovementHistorySet,
  MovementHistoryResult,
  StrengthPrEntry,
  MaxRepsPrEntry,
  EndurancePrEntry,
  MachinePrCalEntry,
  MachinePrDistEntry,
  MachineTimeCapCalEntry,
  MachineTimeCapDistEntry,
  MovementPrTable,
  MovementHistoryPage,
  BenchmarkResult,
  BenchmarkSummaryEntry,
  BenchmarkHistoryEntry,
  BenchmarkHistoryData,
  NamedWorkout,
  EmergencyContact,
  UserProfile,
  UpdateProfileInput,
  GoalType,
  GoalStatus,
  TargetPrType,
  GoalProgress,
  GoalResponse,
  CreateGoalInput,
  UpdateGoalInput,
  Invitation,
  InvitationStatus,
  InvitationChannel,
  GymInvitation,
  MembershipRequestStatus,
  PendingInvitation,
} from '@wodalytics/types'
import { discovery, CLIENT_ID as KEYCLOAK_CLIENT_ID } from './keycloak'

export type {
  AgeDivision,
  IdentifiedGender,
  ResultValue,
  WorkoutGender,
  WorkoutLevel,
  Role,
  WorkoutStatus,
  MovementCategory,
  MovementPrType,
  MovementHistorySet,
  MovementHistoryResult,
  StrengthPrEntry,
  MaxRepsPrEntry,
  EndurancePrEntry,
  MachinePrCalEntry,
  MachinePrDistEntry,
  MachineTimeCapCalEntry,
  MachineTimeCapDistEntry,
  MovementPrTable,
  MovementHistoryPage,
  BenchmarkResult,
  BenchmarkSummaryEntry,
  BenchmarkHistoryEntry,
  BenchmarkHistoryData,
  NamedWorkout,
  EmergencyContact,
  UserProfile,
  GoalType,
  GoalStatus,
  TargetPrType,
  GoalProgress,
  GoalResponse,
  CreateGoalInput,
  UpdateGoalInput,
  Invitation,
  InvitationStatus,
  InvitationChannel,
  GymInvitation,
  MembershipRequestStatus,
  PendingInvitation,
}
// PATCH /api/users/me/profile body alias — the shared Zod-inferred type is
// the authoritative shape; the alias keeps mobile call sites stable.
export type UpdateProfilePayload = UpdateProfileInput
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
// Per-movement prescription on a workout. All prescription fields are
// nullable — programmer fills only the columns relevant to the workout.
// Mirrors the web's `WorkoutMovementWithPrescription`.
export type LoadUnit = 'LB' | 'KG'
export type DistanceUnit = 'M' | 'KM' | 'MI' | 'FT' | 'YD'

export interface Movement {
  id: string
  name: string
  parentId: string | null
  // Programmer-curated short forms ("WB", "KBS", "Wall Ball") that the
  // client-side matcher uses for exact-token detection (#330). Always
  // populated on the GET /api/movements response.
  aliases: string[]
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

// Per-movement prescription as the API expects on POST/PATCH. Mirrors
// `WorkoutMovementPrescriptionSchema` in @wodalytics/types — all fields
// optional except movementId because the editor projects empty strings as
// "leave unset" before sending. Used by the WorkoutEditorScreen save +
// autosave paths in slice 3b of #243.
export interface WorkoutMovementPrescriptionPayload {
  movementId:    string
  displayOrder?: number
  sets?:         number
  reps?:         string
  load?:         number
  loadUnit?:     LoadUnit
  tracksLoad?:   boolean
  tempo?:        string
  distance?:     number
  distanceUnit?: DistanceUnit
  calories?:     number
  seconds?:      number
}

export interface AuthUser {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  birthday: string | null
  avatarUrl: string | null
  // Set by `maybeMarkOnboarded` (packages/db/src/managers/userProfileDbManager.ts)
  // once the four required profile fields are populated. `null` means the user
  // is mid-onboarding — RootNavigator routes them to OnboardingScreen instead
  // of MainTabs.
  onboardedAt: string | null
  role: Role
  identifiedGender: IdentifiedGender | null
  isWodalyticsAdmin?: boolean
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
  // Populated on the Browse catalog responses (#507). Both keys are
  // independently optional — Personal Program for example only ever surfaces
  // `workouts` — so subtypes can narrow as needed.
  _count?: { members?: number; workouts?: number }
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
  // Server-derived "may the viewer edit this workout?" — same source of
  // truth as the requireWorkoutWriteAccess middleware on PATCH/DELETE
  // (#242 slice 2b). Optional so a mobile build pinned to an older API
  // doesn't break the type; treat undefined as "unknown → hide editor."
  canEdit?: boolean
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
  user: {
    id: string
    name: string
    firstName: string | null
    lastName: string | null
    avatarUrl: string | null
    birthday: string | null
  }
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: ResultValue
  notes: string | null
  createdAt: string
  _count: { reactions: number; comments: number }
}

export interface PublicUserProfile {
  id: string
  firstName: string | null
  lastName: string | null
  name: string | null
  avatarUrl: string | null
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

// ── Social types ─────────────────────────────────────────────────────────────

export interface ReactionSummary {
  emoji: string
  count: number
  userReacted: boolean
}

export interface CommentUser {
  id: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
}

export interface Comment {
  id: string
  resultId: string
  parentId: string | null
  body: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  user: CommentUser | null
  reactions: ReactionSummary[]
  replies: Comment[]
  replyCount: number
}

export interface CommentPage {
  comments: Comment[]
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

export interface NewPr {
  movementId: string
  movementName: string
  repCount: number
  load: number
  loadUnit: string
  estimatedOneRepMax: number
}

export interface LogResultResponse {
  result: LeaderboardEntry
  newPrs: NewPr[]
}

export interface UserWorkoutPlanSet {
  reps?: string
  load?: string
  distance?: number
  calories?: number
  seconds?: number
}

export interface UserWorkoutPlanMovementResult {
  workoutMovementId: string
  loadUnit?: string
  distanceUnit?: string
  sets: UserWorkoutPlanSet[]
}

export interface UserWorkoutPlan {
  id: string
  userId: string
  workoutId: string
  level: WorkoutLevel | null
  value: { movementResults: UserWorkoutPlanMovementResult[] } | null
  notes: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string | null; firstName: string | null; lastName: string | null }
  user?: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null }
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
  sets: { reps?: string; load?: number }[]
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

export type MovementDisplayGroup = 'strength' | 'monostructural' | 'gymnastics'

export type MovementPrimaryPR =
  | { type: 'LOAD'; reps: number; load: number; loadUnit: string; achievedAt: string }
  | { type: 'MAX_REPS'; maxReps: number; achievedAt: string }
  | { type: 'TIME'; distance: number; distanceUnit: string; seconds: number; achievedAt: string }
  | { type: 'DISTANCE'; seconds: number; distance: number; distanceUnit: string; achievedAt: string }
  | { type: 'CALORIES'; seconds: number; calories: number; achievedAt: string }

export interface MovementSummaryEntry {
  movementId: string
  name: string
  prTypes: MovementPrType[]
  primaryPR: MovementPrimaryPR | null
  lastLoggedAt: string
}

export type MovementsAnalyticsData = Record<MovementDisplayGroup, MovementSummaryEntry[]>

export interface MovementPrsData {
  movement: { id: string; name: string; category: string; prTypes: MovementPrType[] }
  byType: Record<string, { entries: unknown[] }>
  recentAppearances: { workoutId: string; workoutName: string; scheduledAt: string }[]
}

export interface MovementTrajectoryData {
  prType: MovementPrType
  points: { achievedAt: string; value: number; label: string }[]
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
  // FormData carries its own multipart Content-Type with the boundary string;
  // forcing application/json on top breaks the upload. Detect and skip the
  // default for FormData bodies.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    // Attempt Keycloak token refresh
    const { refreshToken } = await getStoredTokens()
    if (refreshToken) {
      const refreshRes = await fetch(discovery.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: KEYCLOAK_CLIENT_ID,
          refresh_token: refreshToken,
        }).toString(),
      })
      if (refreshRes.ok) {
        const data = await refreshRes.json()
        _accessToken = data.access_token
        await storeTokens(data.access_token, data.refresh_token ?? refreshToken)
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
          coachNotes?: string
          type: WorkoutType
          scheduledAt: string
          tracksRounds?: boolean
          movementIds?: string[]
          movements?: WorkoutMovementPrescriptionPayload[]
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

    programs: {
      // PUBLIC programs in the gym that the caller hasn't joined yet — drives
      // the "From your gym" section of BrowsePrograms (#507).
      browse: (gymId: string) =>
        request<GymProgram[]>(`/api/gyms/${gymId}/programs/browse`),
    },
  },

  programs: {
    // PUBLIC programs that aren't tied to any gym (e.g. CrossFit Mainsite WOD)
    // and that the caller hasn't already joined. Drives the "Public programs"
    // section of BrowsePrograms (#507).
    publicCatalog: () =>
      request<Program[]>('/api/programs/public-catalog'),

    // Self-subscribe to a PUBLIC program. Server returns 403 on PRIVATE,
    // 409 on duplicate. Drives the Join button on BrowsePrograms.
    subscribe: (id: string) =>
      request<{ programId: string; userId: string; role: 'MEMBER' | 'PROGRAMMER'; joinedAt: string }>(
        `/api/programs/${id}/subscribe`,
        { method: 'POST' },
      ),
  },

  workouts: {
    get: (id: string) =>
      request<Workout>(`/api/workouts/${id}`),

    // PATCH /api/workouts/:id. Server middleware (`requireWorkoutWriteAccess`)
    // gates this on UserProgram.role for unaffiliated programs (covers personal
    // programs + admin) and on GymProgram role for gym-affiliated ones — so the
    // mobile client doesn't need to re-derive the permission, just hand off
    // and surface the 403 if the call fails. Slice 2 of #240/#242.
    update: (id: string, data: {
      title?: string
      description?: string
      coachNotes?: string | null
      type?: WorkoutType
      scheduledAt?: string
      timeCapSeconds?: number | null
      tracksRounds?: boolean
      // Replace the workout's movements with this list, in display order.
      // Server schema (UpdateWorkoutSchema) accepts either `movementIds`
      // for the simple case or `movements` for per-movement prescription
      // — but not both. Slice 3b switched the editor to send `movements`
      // (with sets/reps/load/etc); `movementIds` stays here for
      // back-compat with surfaces that don't yet author prescription.
      movementIds?: string[]
      movements?: WorkoutMovementPrescriptionPayload[]
    }) =>
      request<Workout>(`/api/workouts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    // DELETE /api/workouts/:id. Same write-access gate as `update`.
    delete: (id: string) =>
      request<void>(`/api/workouts/${id}`, { method: 'DELETE' }),

    results: (workoutId: string, level?: WorkoutLevel) => {
      const qs = level ? `?level=${level}` : ''
      return request<LeaderboardEntry[]>(`/api/workouts/${workoutId}/results${qs}`)
    },

    logResult: (workoutId: string, data: LogResultInput) =>
      request<LogResultResponse>(`/api/workouts/${workoutId}/results`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  movements: {
    // Full active-movements catalog. Used by `MovementsContext` so the
    // editor can render suggestion + selected pills with proper labels and
    // resolve detected ids back to a full Movement object. Same endpoint
    // the web `useMovements()` provider hits (#243 slice 3a).
    list: () => request<Movement[]>('/api/movements'),

    // `detect` removed in #330 — clients now run the matcher against the
    // catalog they cache via useMovements(). Import `detectMovementsInText`
    // from `@wodalytics/types` instead.

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

  users: {
    public: (userId: string) =>
      request<PublicUserProfile>(`/api/users/${userId}/public`),

    // Per-user "me" namespace under the `/api/users/me/...` route prefix.
    // Other "me" endpoints still live under `api.me.*` (legacy `/api/me/...`
    // shape); these newer ones live here to match the API route file. The
    // asymmetry between `users.me.goals.{list,create}` (under /api/users/me/)
    // and `users.me.goals.{update,remove}` (under /api/goals/) is documented
    // on the goals block below.
    me: {
      profile: {
        get: () => request<UserProfile>('/api/users/me/profile'),
        update: (data: UpdateProfilePayload) =>
          request<UserProfile>('/api/users/me/profile', {
            method: 'PATCH',
            body: JSON.stringify(data),
          }),
      },
      // Goals (#434). Heads up on the asymmetry: list + create POST under
      // `/api/users/me/goals` (member-scoped writes), but `update` and
      // `remove` PATCH/DELETE `/api/goals/:id` because the server treats
      // by-id ops as goal-scoped and enforces ownership in the route handler.
      // The client groups them here for ergonomics; if a matching
      // `PATCH /api/users/me/goals/:id` route ever lands on the server,
      // bridge the two paths rather than splitting the client surface.
      goals: {
        list: (opts?: { status?: GoalStatus }) => {
          const qs = opts?.status ? `?status=${opts.status}` : ''
          return request<GoalResponse[]>(`/api/users/me/goals${qs}`)
        },
        create: (input: CreateGoalInput) =>
          request<GoalResponse>('/api/users/me/goals', {
            method: 'POST',
            body: JSON.stringify(input),
          }),
        update: (goalId: string, patch: UpdateGoalInput) =>
          request<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          }),
        remove: (goalId: string) =>
          request<void>(`/api/goals/${encodeURIComponent(goalId)}`, { method: 'DELETE' }),
      },

      // GymMembershipRequest-backed invitations (staff invited the existing user).
      // Used during onboarding + future settings memberships UI.
      invitations: {
        accept: (id: string) =>
          request<GymInvitation>(`/api/invitations/${id}/accept`, { method: 'POST' }),
        decline: (id: string) =>
          request<GymInvitation>(`/api/invitations/${id}/decline`, { method: 'POST' }),
        // Merged feed of pending Invitation (pre-signup) + GymMembershipRequest
        // (existing user). Same union shape the web Onboarding step 2 consumes.
        pendingAll: () =>
          request<PendingInvitation[]>('/api/users/me/pending-invitations'),
      },

      // Pre-signup invitations identified by short code (email/SMS link).
      codeInvitations: {
        accept: (code: string) =>
          request<Invitation>(`/api/invitations/code/${code}/accept`, { method: 'POST' }),
        decline: (code: string) =>
          request<Invitation>(`/api/invitations/code/${code}/decline`, { method: 'POST' }),
      },

      // Avatar upload / removal. RN's FormData appends image files as the
      // tagged-object shape `{ uri, name, type }`; the API accepts the same
      // multipart field name (`file`) the web AvatarUploader uses.
      avatar: {
        upload: (asset: { uri: string; name: string; mimeType: string }) => {
          const form = new FormData()
          form.append('file', {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType,
          } as unknown as Blob)
          return request<{ avatarUrl: string }>('/api/users/me/avatar', {
            method: 'POST',
            body: form,
          })
        },
        remove: () =>
          request<void>('/api/users/me/avatar', { method: 'DELETE' }),
      },
    },
  },

  social: {
    reactions: {
      listForResult: (resultId: string) =>
        request<ReactionSummary[]>(`/api/results/${resultId}/reactions`),
      addToResult: (resultId: string, emoji: string) =>
        request<{ added: boolean; emoji: string; count: number; userReacted: boolean }>(
          `/api/results/${resultId}/reactions`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
        ),
      removeFromResult: (resultId: string, emoji: string) =>
        request<void>(`/api/results/${resultId}/reactions/${encodeURIComponent(emoji)}`, {
          method: 'DELETE',
        }),
      addToComment: (commentId: string, emoji: string) =>
        request<{ added: boolean; emoji: string; count: number; userReacted: boolean }>(
          `/api/comments/${commentId}/reactions`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
        ),
      removeFromComment: (commentId: string, emoji: string) =>
        request<void>(`/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, {
          method: 'DELETE',
        }),
    },
    comments: {
      list: (resultId: string, page = 1) =>
        request<CommentPage>(`/api/results/${resultId}/comments?page=${page}`),
      create: (resultId: string, body: string) =>
        request<Comment>(`/api/results/${resultId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      reply: (commentId: string, body: string) =>
        request<Comment>(`/api/comments/${commentId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      edit: (commentId: string, body: string) =>
        request<Comment>(`/api/comments/${commentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        }),
      remove: (commentId: string) =>
        request<void>(`/api/comments/${commentId}`, { method: 'DELETE' }),
    },
  },

  plans: {
    getForUser: (workoutId: string, userId: string) =>
      request<UserWorkoutPlan>(`/api/workouts/${workoutId}/plans/${userId}`),

    listForWorkout: (workoutId: string) =>
      request<UserWorkoutPlan[]>(`/api/workouts/${workoutId}/plans`),

    upsert: (workoutId: string, userId: string, data: {
      level?: WorkoutLevel | null
      value?: { movementResults: UserWorkoutPlanMovementResult[] } | null
      notes?: string | null
    }) =>
      request<UserWorkoutPlan>(`/api/workouts/${workoutId}/plans/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (workoutId: string, userId: string) =>
      request<void>(`/api/workouts/${workoutId}/plans/${userId}`, { method: 'DELETE' }),
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
    movements: () =>
      request<MovementsAnalyticsData>('/api/me/analytics/movements'),
    movementPrs: (movementId: string) =>
      request<MovementPrsData>(`/api/me/analytics/movements/${encodeURIComponent(movementId)}`),
    movementTrajectory: (movementId: string, prType: MovementPrType, range: '1M' | '3M' | '6M' | '1Y') =>
      request<MovementTrajectoryData>(`/api/me/analytics/movements/${encodeURIComponent(movementId)}/trajectory?prType=${prType}&range=${range}`),
  },

  benchmarks: {
    list: () =>
      request<BenchmarkSummaryEntry[]>('/api/me/benchmarks'),

    history: (namedWorkoutId: string) =>
      request<BenchmarkHistoryData>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}`),

    logResult: (namedWorkoutId: string, data: {
      achievedAt: string
      level: WorkoutLevel
      workoutGender: WorkoutGender
      value: object
      notes?: string
    }) =>
      request<BenchmarkResult>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}/results`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    deleteResult: (namedWorkoutId: string, resultId: string) =>
      request<void>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}/results/${resultId}`, {
        method: 'DELETE',
      }),
  },

  // ── Named workouts ───────────────────────────────────────────────────────────

  namedWorkouts: {
    // Lite catalog — used by the goal-create flow's named-workout picker. The
    // API returns the full NamedWorkout with templateWorkout/category etc;
    // we only need id+name+category here, so we type it loosely.
    list: () =>
      request<Array<{ id: string; name: string; category?: string }>>('/api/named-workouts'),
  },

  // ── Goals ────────────────────────────────────────────────────────────────────
  //
  // Per-goal read by id. Member-scoped writes / list live under
  // `api.users.me.goals.*` above. Server contract: `apps/api/src/routes/goals.ts`;
  // shared types: `packages/types/src/goal.ts`. Auto-detection of PR_TARGET /
  // FREQUENCY completion happens server-side after each Result is logged —
  // UIs just need to refetch to see the status flip.

  goals: {
    get: (goalId: string) => request<GoalResponse>(`/api/goals/${encodeURIComponent(goalId)}`),
  },
}
