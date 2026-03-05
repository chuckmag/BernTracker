const BASE_URL = import.meta.env.VITE_API_URL ?? ''

let _refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise
  _refreshPromise = fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => (r.ok ? r.json().then((d) => d.accessToken as string) : null))
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
  if (token) headers.set('Authorization', `Bearer ${token}`)

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
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`)
  return data as T
}

export type Role = 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER'

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
  name: string
  role: Role
  joinedAt: string
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
  gyms: {
    create: (data: { name: string; timezone?: string }, token?: string) =>
      req<Gym>('/api/gyms', { method: 'POST', body: JSON.stringify(data), token }),

    get: (id: string, token?: string) => req<Gym>(`/api/gyms/${id}`, { token }),

    update: (id: string, data: { name?: string; timezone?: string }, token?: string) =>
      req<Gym>(`/api/gyms/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

    members: {
      list: (gymId: string, token?: string) =>
        req<Member[]>(`/api/gyms/${gymId}/members`, { token }),

      invite: (gymId: string, data: { email: string; name: string; role?: Role }, token?: string) =>
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
