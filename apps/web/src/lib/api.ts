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
  // Skip Content-Type for FormData so the browser sets the multipart boundary
  // automatically. Setting it explicitly to 'multipart/form-data' would clobber
  // the boundary and break the upload.
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
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
  user: {
    id: string
    name: string | null
    firstName: string | null
    lastName: string | null
    email: string
    avatarUrl: string | null
  }
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
  logoUrl: string | null
  role: Role
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

// ─── Slice 6: bulk workout import ────────────────────────────────────────────

export type WorkoutImportStatus = 'PENDING' | 'DRAFT' | 'PUBLISHED' | 'FAILED'

export interface ParseIssue {
  rowIndex: number | null
  column: string | null
  level: 'warning' | 'error'
  message: string
}

export interface PreviewRow {
  rowIndex: number
  date: string
  dayOrder: number | null
  title: string
  type: WorkoutType
  description: string
  namedWorkout: string | null
  namedWorkoutId: string | null
  source: string | null
  collision: boolean
}

export interface ImportPreview {
  rows: PreviewRow[]
  warnings: ParseIssue[]
  errors: ParseIssue[]
}

export interface WorkoutImportSummary {
  id: string
  filename: string
  rowCount: number
  createdCount: number
  skippedCount: number
  status: WorkoutImportStatus
  uploadedBy: string
  createdAt: string
  updatedAt: string
  errorJson: ParseIssue[] | null
}

export interface WorkoutImportDetail extends WorkoutImportSummary {
  preview: ImportPreview | null
}

export interface UploadImportResponse {
  importId: string
  status: WorkoutImportStatus
  rowCount: number
  filename: string
  preview: ImportPreview
}

export interface DraftImportResponse {
  status: 'DRAFT'
  createdCount: number
  skippedCount: number
  workoutIds: string[]
}

export interface PublishImportResponse {
  status: 'PUBLISHED'
  publishedCount: number
  skippedCount: number
}

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

export interface EmergencyContact {
  id: string
  userId: string
  name: string
  relationship: string | null
  phone: string
  email: string | null
  createdAt: string
  updatedAt: string
}

export interface UserProfile extends Omit<AuthUser, 'isWodalyticsAdmin'> {
  emergencyContacts: EmergencyContact[]
}

export interface UpdateProfilePayload {
  firstName?: string
  lastName?: string
  birthday?: string | null
  identifiedGender?: IdentifiedGender
}

export interface CreateEmergencyContactPayload {
  name: string
  relationship?: string
  phone: string
  email?: string
}

export type UpdateEmergencyContactPayload = Partial<CreateEmergencyContactPayload>

export type MembershipRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED' | 'EXPIRED'

export interface GymInvitation {
  id: string
  gymId: string
  direction: 'STAFF_INVITED' | 'USER_REQUESTED'
  status: MembershipRequestStatus
  email: string | null
  userId: string | null
  roleToGrant: Role
  invitedById: string | null
  decidedById: string | null
  decidedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  gym: { id: string; name: string; slug: string }
  invitedBy: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string } | null
}

export interface CreateInvitationPayload {
  email: string
  roleToGrant?: Role
}

// User-requested join (slice D2). Same model as GymInvitation but with the
// invitedBy slot null and a `user` join populated for the staff-side list.
export interface GymJoinRequest {
  id: string
  gymId: string
  direction: 'USER_REQUESTED'
  status: MembershipRequestStatus
  email: string | null
  userId: string | null
  roleToGrant: Role
  invitedById: string | null
  decidedById: string | null
  decidedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  gym: { id: string; name: string; slug: string }
  user: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string } | null
}

export type GymBrowseStatus = 'NONE' | 'MEMBER' | 'REQUEST_PENDING'

export interface BrowseGym {
  id: string
  name: string
  slug: string
  timezone: string
  logoUrl: string | null
  memberCount: number
  callerStatus: GymBrowseStatus
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
    },
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

    // Slice 6: bulk CSV/XLSX workout upload (#89). Five endpoints driving the
    // PENDING → DRAFT → PUBLISHED lifecycle. All gated to OWNER + PROGRAMMER.
    imports: {
      upload: (programId: string, file: File, token?: string) => {
        const fd = new FormData()
        fd.append('file', file)
        return req<UploadImportResponse>(`/api/programs/${programId}/imports`, {
          method: 'POST',
          body: fd,
          token,
        })
      },

      list: (programId: string, token?: string) =>
        req<WorkoutImportSummary[]>(`/api/programs/${programId}/imports`, { token }),

      get: (programId: string, importId: string, token?: string) =>
        req<WorkoutImportDetail>(`/api/programs/${programId}/imports/${importId}`, { token }),

      draft: (programId: string, importId: string, token?: string) =>
        req<DraftImportResponse>(
          `/api/programs/${programId}/imports/${importId}/draft`,
          { method: 'POST', token },
        ),

      publish: (programId: string, importId: string, token?: string) =>
        req<PublishImportResponse>(
          `/api/programs/${programId}/imports/${importId}/publish`,
          { method: 'POST', token },
        ),
    },
  },
}
