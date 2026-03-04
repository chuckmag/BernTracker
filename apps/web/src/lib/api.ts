const BASE = 'http://localhost:3000'

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
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
    create: (data: { name: string; timezone?: string }) =>
      req<Gym>('/api/gyms', { method: 'POST', body: JSON.stringify(data) }),

    get: (id: string) => req<Gym>(`/api/gyms/${id}`),

    update: (id: string, data: { name?: string; timezone?: string }) =>
      req<Gym>(`/api/gyms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

    members: {
      list: (gymId: string) => req<Member[]>(`/api/gyms/${gymId}/members`),

      invite: (gymId: string, data: { email: string; name: string; role?: Role }) =>
        req<Member>(`/api/gyms/${gymId}/members/invite`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      updateRole: (gymId: string, userId: string, role: Role) =>
        req<unknown>(`/api/gyms/${gymId}/members/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }),

      remove: (gymId: string, userId: string) =>
        req<void>(`/api/gyms/${gymId}/members/${userId}`, { method: 'DELETE' }),
    },

    programs: {
      list: (gymId: string) => req<GymProgram[]>(`/api/gyms/${gymId}/programs`),

      create: (gymId: string, data: { name: string; description?: string; startDate: string; endDate?: string }) =>
        req<{ program: Program }>(`/api/gyms/${gymId}/programs`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },
  },

  programs: {
    subscribe: (id: string, userId: string) =>
      req<unknown>(`/api/programs/${id}/subscribe`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),

    unsubscribe: (id: string, userId: string) =>
      req<void>(`/api/programs/${id}/subscribe`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      }),
  },
}
