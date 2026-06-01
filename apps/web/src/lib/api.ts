import type {
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
  NamedWorkout,
  NamedWorkoutMovement,
  GoalType,
  GoalStatus,
  TargetPrType,
  GoalProgress,
  GoalResponse,
  CreateGoalInput,
  UpdateGoalInput,
  EmergencyContact,
  UserProfile,
  UpdateProfileInput,
  Invitation,
  InvitationStatus,
  InvitationChannel,
  InvitationLookup,
  GymInvitation,
  GymJoinRequest,
  MembershipRequestStatus,
  PendingInvitation,
  BrowseGym,
  GymBrowseStatus,
} from '@wodalytics/types'
import { WORKOUT_TYPE_STYLES } from './workoutTypeStyles'
import keycloak from './keycloak'

export type {
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
  NamedWorkout,
  NamedWorkoutMovement,
  GoalType,
  GoalStatus,
  TargetPrType,
  GoalProgress,
  GoalResponse,
  CreateGoalInput,
  UpdateGoalInput,
  BrowseGym,
  GymBrowseStatus,
}

const BASE_URL = import.meta.env.VITE_API_URL ?? ''
const REQUEST_TIMEOUT_MS = 10_000

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  // Chain an external abort signal (e.g. from useEffect cleanup) with the timeout
  init.signal?.addEventListener('abort', () => controller.abort())
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function apiFetch(
  path: string,
  { token: _token, ...options }: RequestInit & { token?: string } = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  // Skip Content-Type for FormData so the browser sets the multipart boundary
  // automatically. Setting it explicitly to 'multipart/form-data' would clobber
  // the boundary and break the upload.
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (keycloak.authenticated) {
    await keycloak.updateToken(30).catch(() => keycloak.login())
  }
  if (keycloak.token) headers.set('Authorization', `Bearer ${keycloak.token}`)

  return fetchWithTimeout(`${BASE_URL}${path}`, { ...options, headers })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function req<T>(path: string, { token: _token, ...opts }: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await apiFetch(path, opts)
  if (res.status === 401) {
    throw new Error('Session expired. Please log in again.')
  }
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) {
    const err = Object.assign(new Error(data?.error ?? `Request failed: ${res.status}`), { status: res.status })
    throw err
  }
  return data as T
}

export interface Movement {
  id: string
  name: string
  parentId: string | null
  // Programmer-curated short forms ("WB", "KBS", "Wall Ball") that the
  // client-side matcher uses for exact-token detection (#330). Always
  // populated on the GET /api/movements response.
  aliases: string[]
}

export interface PendingMovement {
  id: string
  name: string
  status: 'PENDING'
  parentId: string | null
}

export interface LibraryMovement {
  id: string
  name: string
  status: 'ACTIVE' | 'PENDING'
  category: MovementCategory
  prTypes: MovementPrType[]
  aliases: string[]
  sourceUrl: string | null
  parentId: string | null
  parentName: string | null
  variationCount: number
}

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
export type WorkoutCategory = 'GIRL_WOD' | 'HERO_WOD' | 'OPEN_WOD' | 'GAMES_WOD' | 'BENCHMARK'

/**
 * @deprecated Use `WORKOUT_TYPE_STYLES[type].abbr` from `./workoutTypeStyles`.
 * Retained as a shim so non-migrated callers keep working in one step.
 */
export const TYPE_ABBR = Object.fromEntries(
  Object.entries(WORKOUT_TYPE_STYLES).map(([k, v]) => [k, v.abbr]),
) as Record<WorkoutType, string>
export type LoadUnit = 'LB' | 'KG'
export type DistanceUnit = 'M' | 'KM' | 'MI' | 'FT' | 'YD'

// Per-movement prescription as it goes over the wire on workout create/update.
// Only `movementId` is required; everything else is optional.
export interface WorkoutMovementInput {
  movementId: string
  displayOrder?: number
  sets?: number
  reps?: string
  load?: number
  loadUnit?: LoadUnit
  // Whether the result form should surface a Load column for this movement.
  // Defaults true at the API boundary — programmer flips off for plyometric
  // supersets and other no-load pieces.
  tracksLoad?: boolean
  tempo?: string
  distance?: number
  distanceUnit?: DistanceUnit
  calories?: number
  seconds?: number
}

// Per-movement prescription on a workout. All prescription fields are
// nullable — programmer fills only the columns relevant to the workout.
// `tracksLoad` is always populated on read since the Prisma column has
// `@default(true)`.
export interface WorkoutMovementWithPrescription {
  movement: Movement
  displayOrder: number
  sets: number | null
  reps: string | null
  load: number | null
  loadUnit: LoadUnit | null
  tracksLoad: boolean
  tempo: string | null
  distance: number | null
  distanceUnit: DistanceUnit | null
  calories: number | null
  seconds: number | null
}

export interface Workout {
  id: string
  title: string
  description: string
  /**
   * Programmer-authored stimulus / teaching notes. Optional, nullable. Visible
   * to every gym member but UI defaults to collapsed for MEMBER and expanded
   * for COACH/PROGRAMMER/OWNER (see #184). Empty string is treated as null on
   * write — the API normalizes `""` → `null`.
   */
  coachNotes: string | null
  type: WorkoutType
  status: WorkoutStatus
  scheduledAt: string
  dayOrder: number
  workoutMovements: WorkoutMovementWithPrescription[]
  programId: string | null
  program: { id: string; name: string } | null
  namedWorkoutId: string | null
  namedWorkout: { id: string; name: string; category: WorkoutCategory } | null
  timeCapSeconds: number | null
  tracksRounds: boolean
  _count: { results: number }
  /**
   * Viewer's own result on this workout, or null if they haven't logged one.
   * Surfaced by the feed list endpoint (`GET /api/gyms/:gymId/workouts`); the
   * single-workout `GET /api/workouts/:id` endpoint does not populate it.
   */
  myResultId?: string | null
  /**
   * Stable identifier from an external ingest source, e.g.
   * "crossfit-mainsite:w20260425". Null for user-authored workouts.
   * Used to derive a link back to the source page on the workout detail view.
   */
  externalSourceId: string | null
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
  user: {
    id: string
    name: string | null
    firstName: string | null
    lastName: string | null
    email: string
    avatarUrl: string | null
    birthday: string | null
  }
  workout: { type: WorkoutType }
  _count: { reactions: number; comments: number }
}

export interface ReactionSummary {
  emoji: string
  count: number
  userReacted: boolean
}

export interface Comment {
  id: string
  resultId: string
  parentId: string | null
  body: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; firstName: string | null; lastName: string | null; avatarUrl: string | null } | null
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

export interface NewPr {
  movementId: string
  movementName: string
  repCount: number
  load: number
  loadUnit: string
  estimatedOneRepMax: number
}

export interface LogResultResponse {
  result: WorkoutResult
  newPrs: NewPr[]
}

export interface HistoryResult extends Omit<WorkoutResult, 'workout'> {
  workout: { id: string; title: string; type: WorkoutType; scheduledAt: string }
}

export interface UserWorkoutPlan {
  id: string
  userId: string
  workoutId: string
  level: WorkoutLevel | null
  value: { movementResults: Array<{
    workoutMovementId: string
    loadUnit?: string
    distanceUnit?: string
    sets: Array<{ reps?: string; load?: string; distance?: number; calories?: number; seconds?: number }>
  }> } | null
  notes: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string | null; firstName: string | null; lastName: string | null }
  user?: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null }
}

export interface ResultHistoryPage {
  results: HistoryResult[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface DashboardTodayResult {
  id: string
  value: Record<string, unknown>
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

export interface DashboardTodayWorkout {
  workout: Workout
  myResult: DashboardTodayResult | null
  leaderboard: DashboardLeaderboard | null
  /** Subscribers to this workout's program via UserProgram. Used when isHeroWorkoutGymAffiliated is false. */
  programSubscriberCount: number
  /** False for unaffiliated programs (e.g. CrossFit Mainsite) — use programSubscriberCount for the social count. */
  isHeroWorkoutGymAffiliated: boolean
}

export interface DashboardToday {
  /** All published workouts for today, non-recovery first. Index 0 is the default hero. */
  workouts: DashboardTodayWorkout[]
  gymMemberCount: number
}

export interface MyGym {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: Role
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

export type MovementLoadEntry = { repCount: number; load: number; loadUnit: string; achievedAt: string; resultId: string; workoutId: string }
export type MovementMaxRepsEntry = { maxReps: number; achievedAt: string; resultId: string; workoutId: string }
export type MovementTimeEntry = { distance: number; distanceUnit: string; seconds: number; achievedAt: string; resultId: string; workoutId: string }
export type MovementDistanceEntry = { seconds: number; distance: number; distanceUnit: string; achievedAt: string; resultId: string; workoutId: string }
export type MovementCaloriesEntry = { seconds: number; calories: number; achievedAt: string; resultId: string; workoutId: string }
export type MovementPrEntry = MovementLoadEntry | MovementMaxRepsEntry | MovementTimeEntry | MovementDistanceEntry | MovementCaloriesEntry

export interface MovementPrsData {
  movement: { id: string; name: string; category: string; prTypes: MovementPrType[] }
  byType: Record<string, { entries: MovementPrEntry[] }>
  recentAppearances: { workoutId: string; workoutName: string; scheduledAt: string; yourSets: unknown[] }[]
}

export interface MovementTrajectoryData {
  prType: MovementPrType
  points: { achievedAt: string; value: number; label: string }[]
}

export interface BenchmarkSummaryEntry extends NamedWorkout {
  manualResultCount: number
  latestResult: BenchmarkResult | null
}

export interface BenchmarkHistoryEntry {
  source: 'manual' | 'programmed'
  id: string
  achievedAt: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: object
  notes: string | null
  primaryScoreKind: string | null
  primaryScoreValue: number | null
  createdAt: string
  updatedAt?: string
  workoutId?: string
}

export interface BenchmarkHistoryData {
  namedWorkout: NamedWorkout
  history: BenchmarkHistoryEntry[]
}

export interface BenchmarkResultInput {
  achievedAt: string
  level: WorkoutLevel
  workoutGender: WorkoutGender
  value: {
    score: { kind: 'TIME'; seconds: number; cappedOut: boolean }
      | { kind: 'ROUNDS_REPS'; rounds: number; reps: number; cappedOut: boolean }
      | { kind: 'LOAD'; load: number; unit: LoadUnit }
      | { kind: 'REPS'; reps: number }
    movementResults: never[]
  }
  notes?: string
}

export interface Gym {
  id: string
  name: string
  slug: string
  timezone: string
  logoUrl: string | null
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

export type ProgramVisibility = 'PUBLIC' | 'PRIVATE'

export interface Program {
  id: string
  name: string
  description: string | null
  startDate: string
  endDate: string | null
  coverColor: string | null
  visibility: ProgramVisibility
  createdAt: string
  updatedAt: string
  _count?: { members: number; workouts: number }
}

// User's private "Personal Program" (#183). Same Prisma model as Program with
// `ownerUserId` set, no GymProgram links, and PRIVATE visibility. The
// `_count.workouts` field is always populated since the page header reads it.
export interface PersonalProgram extends Omit<Program, '_count'> {
  ownerUserId: string
  _count: { workouts: number }
}

export type ProgramRole = 'MEMBER' | 'PROGRAMMER'

export interface ProgramMember {
  id: string
  email: string
  name: string | null
  role: ProgramRole
  joinedAt: string
}

export interface GymProgram {
  gymId: string
  programId: string
  isDefault: boolean
  createdAt: string
  program: Program
}

export type IdentifiedGender = 'FEMALE' | 'MALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | null

export interface AuthUser {
  id: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  birthday: string | null
  avatarUrl: string | null
  onboardedAt: string | null
  role: Role
  identifiedGender: IdentifiedGender
  isWodalyticsAdmin: boolean
}

export type { EmergencyContact, UserProfile }

export interface PublicUserProfile {
  id: string
  firstName: string | null
  lastName: string | null
  name: string | null
  avatarUrl: string | null
}

// PATCH /api/users/me/profile body alias — the shared Zod-inferred type is
// the authoritative shape; the alias keeps existing web call sites stable.
export type UpdateProfilePayload = UpdateProfileInput

export interface CreateEmergencyContactPayload {
  name: string
  relationship?: string
  phone: string
  email?: string
}

export type UpdateEmergencyContactPayload = Partial<CreateEmergencyContactPayload>

export type {
  MembershipRequestStatus,
  GymInvitation,
  InvitationStatus,
  InvitationChannel,
  Invitation,
  InvitationLookup,
  PendingInvitation,
}

export interface CreateInvitationPayload {
  email: string
  roleToGrant?: Role
}

// Unified gym invite response — backend routes to whichever model fits
export type GymInviteResponse =
  | { kind: 'invitation'; data: Invitation }
  | { kind: 'membershipRequest'; data: GymInvitation }

export interface CreateGymInvitePayload {
  channel: InvitationChannel
  email?: string   // required when channel = 'EMAIL'
  phone?: string   // required when channel = 'SMS', E.164
  roleToGrant?: Role
}

export interface CreateAppInvitePayload {
  channel: InvitationChannel
  email?: string
  phone?: string
}

export type { GymJoinRequest }

export const api = {
  auth: {
    me: () => req<AuthUser>('/api/auth/me'),
  },

  users: {
    me: {
      profile: {
        get: () => req<UserProfile>('/api/users/me/profile'),
        update: (data: UpdateProfilePayload) =>
          req<UserProfile>('/api/users/me/profile', {
            method: 'PATCH',
            body: JSON.stringify(data),
          }),
      },
      emergencyContacts: {
        list: () => req<EmergencyContact[]>('/api/users/me/emergency-contacts'),
        create: (data: CreateEmergencyContactPayload) =>
          req<EmergencyContact>('/api/users/me/emergency-contacts', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
        update: (id: string, data: UpdateEmergencyContactPayload) =>
          req<EmergencyContact>(`/api/users/me/emergency-contacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
          }),
        remove: (id: string) =>
          req<void>(`/api/users/me/emergency-contacts/${id}`, { method: 'DELETE' }),
      },
      invitations: {
        list: () => req<GymInvitation[]>('/api/users/me/invitations'),
        accept: (id: string) =>
          req<GymInvitation>(`/api/invitations/${id}/accept`, { method: 'POST' }),
        decline: (id: string) =>
          req<GymInvitation>(`/api/invitations/${id}/decline`, { method: 'POST' }),
        // Merged pending list: Invitation (pre-signup) + GymMembershipRequest (existing user)
        pendingAll: () => req<PendingInvitation[]>('/api/users/me/pending-invitations'),
      },
      codeInvitations: {
        accept: (code: string) =>
          req<Invitation>(`/api/invitations/code/${code}/accept`, { method: 'POST' }),
        decline: (code: string) =>
          req<Invitation>(`/api/invitations/code/${code}/decline`, { method: 'POST' }),
      },
      joinRequests: {
        list: () => req<GymJoinRequest[]>('/api/users/me/join-requests'),
      },
      avatar: {
        upload: (file: File) => {
          const form = new FormData()
          form.append('file', file)
          return req<{ avatarUrl: string }>('/api/users/me/avatar', { method: 'POST', body: form })
        },
        remove: () =>
          req<void>('/api/users/me/avatar', { method: 'DELETE' }),
      },
      goals: {
        /**
         * List the caller's goals, optionally filtered by status.
         * Returns each goal with its computed progress so the UI does
         * not have to re-derive it.
         */
        list: (params?: { status?: GoalStatus }) => {
          const qs = params?.status ? `?status=${encodeURIComponent(params.status)}` : ''
          return req<GoalResponse[]>(`/api/users/me/goals${qs}`)
        },
        create: (data: CreateGoalInput) =>
          req<GoalResponse>('/api/users/me/goals', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      },
    },
    public: (userId: string) => req<PublicUserProfile>(`/api/users/${userId}/public`),
  },

  goals: {
    get: (id: string) => req<GoalResponse>(`/api/goals/${id}`),
    update: (id: string, data: UpdateGoalInput) =>
      req<GoalResponse>(`/api/goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      req<void>(`/api/goals/${id}`, { method: 'DELETE' }),
  },

  me: {
    gyms: () => req<MyGym[]>('/api/me/gyms'),
    /**
     * Caller's available programs in the given gym. Server returns all gym
     * programs for staff (OWNER/PROGRAMMER/COACH); MEMBER sees only their
     * UserProgram subscriptions. Drives the sidebar ProgramFilterPicker.
     */
    programs: (gymId: string, token?: string) =>
      req<GymProgram[]>(`/api/me/programs?gymId=${encodeURIComponent(gymId)}`, { token }),

    personalProgram: {
      // Returns the caller's private "Personal Program" (#183), creating it on
      // first call. Idempotent — repeat calls return the existing row.
      get: (token?: string) =>
        req<PersonalProgram>('/api/me/personal-program', { token }),

      workouts: {
        // Date range optional. When `from` and `to` are both supplied the
        // server filters to that window — used by the calendar page to fetch
        // a single visible month at a time.
        list: (range?: { from: string; to: string }, token?: string) => {
          const qs = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : ''
          return req<Workout[]>(`/api/me/personal-program/workouts${qs}`, { token })
        },
        // Body uses the same shape as `api.workouts.create` minus `programId`,
        // which the server pins to the caller's personal program.
        create: (
          data: {
            title: string
            description: string
            type: WorkoutType
            scheduledAt: string
            movementIds?: string[]
            movements?: WorkoutMovementInput[]
            namedWorkoutId?: string
            timeCapSeconds?: number | null
            tracksRounds?: boolean
          },
          token?: string,
        ) =>
          req<Workout>('/api/me/personal-program/workouts', {
            method: 'POST',
            body: JSON.stringify(data),
            token,
          }),
      },
    },

    analytics: {
      consistency: (weeks?: number) => {
        const qs = weeks ? `?weeks=${weeks}` : ''
        return req<ConsistencyData>(`/api/me/analytics/consistency${qs}`)
      },
      trackedMovements: (days = 60, limit = 5) =>
        req<TrackedMovement[]>(`/api/me/analytics/tracked-movements?days=${days}&limit=${limit}`),
      strengthTrajectory: (movementId: string, range: '1M' | '3M' | '6M' | '1Y') =>
        req<StrengthTrajectoryData>(`/api/me/analytics/strength-trajectory?movementId=${encodeURIComponent(movementId)}&range=${range}`),
      movements: () =>
        req<MovementsAnalyticsData>('/api/me/analytics/movements'),
      movementPrs: (movementId: string) =>
        req<MovementPrsData>(`/api/me/analytics/movements/${encodeURIComponent(movementId)}`),
      movementTrajectory: (movementId: string, prType: MovementPrType, range: '1M' | '3M' | '6M' | '1Y') =>
        req<MovementTrajectoryData>(`/api/me/analytics/movements/${encodeURIComponent(movementId)}/trajectory?prType=${prType}&range=${range}`),
    },

    benchmarks: {
      list: () => req<BenchmarkSummaryEntry[]>('/api/me/benchmarks'),
      history: (namedWorkoutId: string) =>
        req<BenchmarkHistoryData>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}`),
      logResult: (namedWorkoutId: string, input: BenchmarkResultInput) =>
        req<BenchmarkResult>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}/results`, {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      deleteResult: (namedWorkoutId: string, resultId: string) =>
        req<void>(`/api/me/benchmarks/${encodeURIComponent(namedWorkoutId)}/results/${resultId}`, {
          method: 'DELETE',
        }),
    },
  },

  gyms: {
    dashboard: {
      today: (gymId: string, programIds?: string[]) => {
        const qs = programIds?.length ? `?programIds=${programIds.join(',')}` : ''
        return req<DashboardToday>(`/api/gyms/${gymId}/dashboard/today${qs}`)
      },
    },

    create: (data: { name: string; timezone?: string }, token?: string) =>
      req<Gym>('/api/gyms', { method: 'POST', body: JSON.stringify(data), token }),

    get: (id: string, token?: string) => req<Gym>(`/api/gyms/${id}`, { token }),

    update: (id: string, data: { name?: string; timezone?: string }, token?: string) =>
      req<Gym>(`/api/gyms/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

    members: {
      list: (gymId: string, token?: string) =>
        req<Member[]>(`/api/gyms/${gymId}/members`, { token }),

      // Note: legacy `members.invite` removed in slice D1 — see
      // `api.gyms.invitations.create` for the pending-invitation flow.

      updateRole: (gymId: string, userId: string, role: Role, token?: string) =>
        req<unknown>(`/api/gyms/${gymId}/members/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
          token,
        }),

      remove: (gymId: string, userId: string, token?: string) =>
        req<void>(`/api/gyms/${gymId}/members/${userId}`, { method: 'DELETE', token }),
    },

    invitations: {
      list: (gymId: string) =>
        req<GymInvitation[]>(`/api/gyms/${gymId}/invitations`),
      create: (gymId: string, data: CreateInvitationPayload) =>
        req<GymInvitation>(`/api/gyms/${gymId}/invitations`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      revoke: (gymId: string, id: string) =>
        req<GymInvitation>(`/api/gyms/${gymId}/invitations/${id}/revoke`, { method: 'POST' }),
      // Unified invite — backend routes to GymMembershipRequest (existing user)
      // or pre-signup Invitation (new user) based on whether email matches an account
      invite: (gymId: string, data: CreateGymInvitePayload) =>
        req<GymInviteResponse>(`/api/gyms/${gymId}/invite`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
    codeInvitations: {
      lookup: (code: string) => req<InvitationLookup>(`/api/invitations/code/${code}`),
      revoke: (id: string) =>
        req<Invitation>(`/api/invitations/${id}/revoke`, { method: 'POST' }),
      create: (data: CreateAppInvitePayload) =>
        req<Invitation>('/api/invitations', { method: 'POST', body: JSON.stringify(data) }),
    },

    logo: {
      upload: (gymId: string, file: File) => {
        const form = new FormData()
        form.append('file', file)
        return req<{ logoUrl: string }>(`/api/gyms/${gymId}/logo`, { method: 'POST', body: form })
      },
      setUrl: (gymId: string, logoUrl: string) =>
        req<{ logoUrl: string }>(`/api/gyms/${gymId}/logo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logoUrl }),
        }),
      remove: (gymId: string) =>
        req<void>(`/api/gyms/${gymId}/logo`, { method: 'DELETE' }),
    },

    browse: (search?: string) => {
      const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
      return req<BrowseGym[]>(`/api/gyms${qs}`)
    },

    joinRequest: {
      // User-side: ask to join / cancel an outgoing request.
      create: (gymId: string) =>
        req<GymJoinRequest>(`/api/gyms/${gymId}/join-request`, { method: 'POST' }),
      cancel: (gymId: string) =>
        req<GymJoinRequest>(`/api/gyms/${gymId}/join-request`, { method: 'DELETE' }),
    },

    joinRequests: {
      // Staff-side inbox.
      list: (gymId: string) =>
        req<GymJoinRequest[]>(`/api/gyms/${gymId}/join-requests`),
      approve: (gymId: string, id: string) =>
        req<GymJoinRequest>(`/api/gyms/${gymId}/join-requests/${id}/approve`, { method: 'POST' }),
      decline: (gymId: string, id: string) =>
        req<GymJoinRequest>(`/api/gyms/${gymId}/join-requests/${id}/decline`, { method: 'POST' }),
    },

    programs: {
      list: (gymId: string, token?: string) =>
        req<GymProgram[]>(`/api/gyms/${gymId}/programs`, { token }),

      create: (
        gymId: string,
        data: { name: string; description?: string; startDate: string; endDate?: string; coverColor?: string; visibility?: ProgramVisibility },
        token?: string,
      ) =>
        req<{ program: Program }>(`/api/gyms/${gymId}/programs`, {
          method: 'POST',
          body: JSON.stringify(data),
          token,
        }),

      browse: (gymId: string, token?: string) =>
        req<GymProgram[]>(`/api/gyms/${gymId}/programs/browse`, { token }),

      /**
       * Mark a PUBLIC program as the gym default (slice 5 / #88). OWNER only;
       * server clears any prior default in the same transaction. Returns 400
       * if the program is PRIVATE, 404 if not linked to this gym.
       */
      setDefault: (gymId: string, programId: string, token?: string) =>
        req<void>(`/api/gyms/${gymId}/programs/${programId}/default`, { method: 'PATCH', token }),

      /**
       * Clear the default flag for this program. OWNER only, idempotent.
       * Required before flipping a default program's visibility to PRIVATE
       * — the visibility PATCH refuses while the default flag is set, so
       * the OWNER must run this first.
       */
      clearDefault: (gymId: string, programId: string, token?: string) =>
        req<void>(`/api/gyms/${gymId}/programs/${programId}/default`, { method: 'DELETE', token }),
    },
  },

  workouts: {
    list: (
      gymId: string,
      from: string,
      to: string,
      filters?: { movementIds?: string[]; programIds?: string[] },
      token?: string,
    ) => {
      const params = new URLSearchParams({ from, to })
      if (filters?.programIds?.length) params.set('programIds', filters.programIds.join(','))
      let qs = params.toString()
      if (filters?.movementIds?.length) {
        // movementIds intentionally repeated rather than CSV — matches the
        // server-side parser in routes/workouts.ts
        qs += '&' + filters.movementIds.map((id) => `movementIds=${encodeURIComponent(id)}`).join('&')
      }
      return req<Workout[]>(`/api/gyms/${gymId}/workouts?${qs}`, { token })
    },

    create: (
      gymId: string,
      data: {
        programId?: string
        title: string
        description: string
        coachNotes?: string
        type: WorkoutType
        scheduledAt: string
        movementIds?: string[]
        movements?: WorkoutMovementInput[]
        namedWorkoutId?: string
        timeCapSeconds?: number | null
        tracksRounds?: boolean
      },
      token?: string,
    ) =>
      req<Workout>(`/api/gyms/${gymId}/workouts`, { method: 'POST', body: JSON.stringify(data), token }),

    update: (
      id: string,
      data: {
        title?: string
        description?: string
        // Nullable so clients can clear the notes; the API also accepts "" and
        // normalizes it to null on write.
        coachNotes?: string | null
        type?: WorkoutType
        scheduledAt?: string
        dayOrder?: number
        movementIds?: string[]
        movements?: WorkoutMovementInput[]
        namedWorkoutId?: string | null
        timeCapSeconds?: number | null
        tracksRounds?: boolean
      },
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

    history: (page = 1, movementIds?: string[], programIds?: string[], token?: string) => {
      const parts: string[] = []
      if (movementIds?.length) parts.push(...movementIds.map((id) => `movementIds=${encodeURIComponent(id)}`))
      if (programIds?.length) parts.push(...programIds.map((id) => `programIds=${encodeURIComponent(id)}`))
      const qs = parts.length ? `&${parts.join('&')}` : ''
      return req<ResultHistoryPage>(`/api/me/results?page=${page}${qs}`, { token })
    },
  },

  plans: {
    listForWorkout: (workoutId: string, token?: string) =>
      req<UserWorkoutPlan[]>(`/api/workouts/${workoutId}/plans`, { token }),

    getForUser: (workoutId: string, userId: string, token?: string) =>
      req<UserWorkoutPlan>(`/api/workouts/${workoutId}/plans/${userId}`, { token }),

    upsert: (
      workoutId: string,
      userId: string,
      data: { level?: WorkoutLevel | null; value?: { movementResults: unknown[] } | null; notes?: string | null },
      token?: string,
    ) =>
      req<UserWorkoutPlan>(`/api/workouts/${workoutId}/plans/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        token,
      }),

    delete: (workoutId: string, userId: string, token?: string) =>
      req<void>(`/api/workouts/${workoutId}/plans/${userId}`, { method: 'DELETE', token }),
  },

  movements: {
    list: (token?: string) =>
      req<Movement[]>('/api/movements', { token }),

    // `detect` removed in #330 — clients now run the matcher against the
    // catalog they cache via useMovements(). Import `detectMovementsInText`
    // from `@wodalytics/types` instead.

    suggest: (data: { name: string; parentId?: string }, token?: string) =>
      req<Movement>('/api/movements/suggest', {
        method: 'POST',
        body: JSON.stringify(data),
        token,
      }),

    pending: (token?: string) =>
      req<PendingMovement[]>('/api/movements/pending', { token }),

    update: (
      id: string,
      data: { name?: string; parentId?: string | null; category?: MovementCategory; prTypes?: MovementPrType[] },
      token?: string,
    ) =>
      req<LibraryMovement>(`/api/movements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    review: (
      id: string,
      data: { status: 'ACTIVE' | 'REJECTED'; category?: MovementCategory; prTypes?: MovementPrType[] },
      token?: string,
    ) =>
      req<LibraryMovement>(`/api/movements/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    library: (token?: string) =>
      req<LibraryMovement[]>('/api/movements?view=library', { token }),

    myHistory: (id: string, page = 1, limit = 10, token?: string) =>
      req<MovementHistoryPage>(`/api/movements/${id}/my-history?page=${page}&limit=${limit}`, { token }),
  },

  programs: {
    get: (id: string, token?: string) =>
      req<GymProgram>(`/api/programs/${id}`, { token }),

    /**
     * Public programs that aren't tied to any gym (e.g. CrossFit Mainsite WOD)
     * and that the caller hasn't already joined. Drives the primary section
     * of the Browse page. Auth-only; no gym context.
     */
    publicCatalog: (token?: string) =>
      req<Program[]>(`/api/programs/public-catalog`, { token }),

    update: (
      id: string,
      data: {
        name?: string
        description?: string | null
        startDate?: string
        endDate?: string | null
        coverColor?: string | null
        visibility?: ProgramVisibility
      },
      token?: string,
    ) =>
      req<Program>(`/api/programs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        token,
      }),

    delete: (id: string, token?: string) =>
      req<void>(`/api/programs/${id}`, { method: 'DELETE', token }),

    members: {
      list: (programId: string, token?: string) =>
        req<ProgramMember[]>(`/api/programs/${programId}/members`, { token }),

      invite: (
        programId: string,
        data: { userId?: string; email?: string; role?: ProgramRole },
        token?: string,
      ) =>
        req<{ programId: string; userId: string; role: ProgramRole; joinedAt: string }>(
          `/api/programs/${programId}/members`,
          { method: 'POST', body: JSON.stringify(data), token },
        ),

      remove: (programId: string, userId: string, token?: string) =>
        req<void>(`/api/programs/${programId}/members/${userId}`, { method: 'DELETE', token }),
    },

    /**
     * Self-subscribe to a PUBLIC program (slice 4). Server returns 403 on
     * PRIVATE programs, 409 on duplicate. Drives the Browse page's Join
     * button.
     */
    subscribe: (id: string, token?: string) =>
      req<{ programId: string; userId: string; role: ProgramRole; joinedAt: string }>(
        `/api/programs/${id}/subscribe`,
        { method: 'POST', token },
      ),

    /** Leave a program — caller's own membership only. */
    unsubscribe: (id: string, token?: string) =>
      req<void>(`/api/programs/${id}/subscribe`, { method: 'DELETE', token }),
  },

  social: {
    reactions: {
      listForResult: (resultId: string) =>
        req<ReactionSummary[]>(`/api/results/${resultId}/reactions`),
      addToResult: (resultId: string, emoji: string) =>
        req<{ id: string; resultId: string; userId: string; emoji: string }>(
          `/api/results/${resultId}/reactions`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
        ),
      removeFromResult: (resultId: string, emoji: string) =>
        req<void>(`/api/results/${resultId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
      addToComment: (commentId: string, emoji: string) =>
        req<{ id: string; commentId: string; userId: string; emoji: string }>(
          `/api/comments/${commentId}/reactions`,
          { method: 'POST', body: JSON.stringify({ emoji }) },
        ),
      removeFromComment: (commentId: string, emoji: string) =>
        req<void>(`/api/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
    },
    comments: {
      list: (resultId: string, page = 1) =>
        req<CommentPage>(`/api/results/${resultId}/comments?page=${page}`),
      create: (resultId: string, body: string) =>
        req<Comment>(`/api/results/${resultId}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      reply: (commentId: string, body: string) =>
        req<Comment>(`/api/comments/${commentId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
      edit: (commentId: string, body: string) =>
        req<Comment>(`/api/comments/${commentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        }),
      remove: (commentId: string) =>
        req<void>(`/api/comments/${commentId}`, { method: 'DELETE' }),
    },
  },

  /**
   * WODalytics admin surface (#160). Curates unaffiliated/public-catalog
   * programs. Every endpoint is gated server-side by `requireWodalyticsAdmin`.
   * The web app keys off `user.isWodalyticsAdmin` to render the entry point;
   * this client surface is the data layer underneath.
   */
  admin: {
    programs: {
      list: (token?: string) =>
        req<Program[]>(`/api/admin/programs`, { token }),
      get: (id: string, token?: string) =>
        req<Program>(`/api/admin/programs/${id}`, { token }),
      listWorkouts: (id: string, token?: string) =>
        req<Workout[]>(`/api/admin/programs/${id}/workouts`, { token }),
      create: (
        data: { name: string; description?: string; startDate: string; endDate?: string; coverColor?: string | null; visibility?: ProgramVisibility },
        token?: string,
      ) =>
        req<Program>(`/api/admin/programs`, { method: 'POST', body: JSON.stringify(data), token }),
      update: (
        id: string,
        data: { name?: string; description?: string | null; startDate?: string; endDate?: string | null; coverColor?: string | null; visibility?: ProgramVisibility },
        token?: string,
      ) =>
        req<Program>(`/api/admin/programs/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
      delete: (id: string, token?: string) =>
        req<void>(`/api/admin/programs/${id}`, { method: 'DELETE', token }),
      createWorkout: (
        programId: string,
        data: {
          title: string
          description: string
          coachNotes?: string
          type: WorkoutType
          scheduledAt: string
          movementIds?: string[]
          movements?: WorkoutMovementInput[]
          namedWorkoutId?: string
          timeCapSeconds?: number | null
          tracksRounds?: boolean
        },
        token?: string,
      ) =>
        req<Workout>(`/api/admin/programs/${programId}/workouts`, { method: 'POST', body: JSON.stringify(data), token }),
    },
    workouts: {
      update: (
        id: string,
        data: {
          title?: string
          description?: string
          coachNotes?: string | null
          type?: WorkoutType
          scheduledAt?: string
          dayOrder?: number
          movementIds?: string[]
          movements?: WorkoutMovementInput[]
          namedWorkoutId?: string | null
          timeCapSeconds?: number | null
          tracksRounds?: boolean
        },
        token?: string,
      ) =>
        req<Workout>(`/api/admin/workouts/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),
      publish: (id: string, token?: string) =>
        req<Workout>(`/api/admin/workouts/${id}/publish`, { method: 'POST', token }),
      delete: (id: string, token?: string) =>
        req<void>(`/api/admin/workouts/${id}`, { method: 'DELETE', token }),
    },
  },
}
