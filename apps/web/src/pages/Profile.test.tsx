import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Profile from './Profile'
import type { UserProfile } from '../lib/api'

const baseProfile: UserProfile = {
  id: 'u1',
  email: 'a@test.com',
  name: 'Alice Anderson',
  firstName: 'Alice',
  lastName: 'Anderson',
  birthday: '1990-04-15T00:00:00.000Z',
  avatarUrl: null,
  onboardedAt: '2026-01-01T00:00:00.000Z',
  role: 'MEMBER',
  identifiedGender: 'FEMALE',
  emergencyContacts: [
    {
      id: 'c1',
      userId: 'u1',
      name: 'Bob',
      relationship: 'Spouse',
      phone: '555-1234',
      email: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

vi.mock('../lib/api', () => ({
  api: {
    users: {
      me: {
        profile: {
          get: vi.fn(),
          update: vi.fn(),
        },
        emergencyContacts: {
          create: vi.fn(),
          remove: vi.fn(),
        },
        invitations: {
          list: vi.fn(),
          accept: vi.fn(),
          decline: vi.fn(),
        },
        joinRequests: {
          list: vi.fn().mockResolvedValue([]),
        },
      },
    },
    me: {
      gyms: vi.fn().mockResolvedValue([]),
    },
    gyms: {
      joinRequest: {
        cancel: vi.fn(),
      },
    },
    auth: { logout: vi.fn() },
  },
}))

vi.mock('../context/InvitationsContext.tsx', () => ({
  useInvitations: () => ({
    invitations: [],
    loading: false,
    refresh: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
  }),
}))

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@test.com', firstName: 'Alice', lastName: 'Anderson' },
    accessToken: 'tok',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.users.me.profile.get).mockResolvedValue(baseProfile)
})

describe('Profile page', () => {
  it('renders the page heading and existing values', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Your profile' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Anderson')).toBeInTheDocument()
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument()
  })

  it('lists existing emergency contacts and offers an add form', async () => {
    render(<MemoryRouter><Profile /></MemoryRouter>)
    expect(await screen.findByText(/Bob/)).toBeInTheDocument()
    expect(screen.getByText('555-1234')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact name')).toBeInTheDocument()
  })

  it('saves profile updates via PATCH', async () => {
    vi.mocked(api.users.me.profile.update).mockResolvedValue(baseProfile)
    render(<MemoryRouter><Profile /></MemoryRouter>)
    await screen.findByDisplayValue('Alice')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.users.me.profile.update).toHaveBeenCalled())
    const call = vi.mocked(api.users.me.profile.update).mock.calls[0][0]
    expect(call.firstName).toBe('Alice')
    expect(call.lastName).toBe('Anderson')
  })

  it('switches to Gym Memberships tab and renders the gym list', async () => {
    vi.mocked(api.me.gyms).mockResolvedValue([
      { id: 'g1', name: 'Crossfit Bern', slug: 'bern', role: 'OWNER' },
    ])
    render(<MemoryRouter><Profile /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Your profile' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Gym Memberships' }))
    expect(await screen.findByText('Crossfit Bern')).toBeInTheDocument()
    // Personal info from the Details tab should not be rendered now.
    expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument()
  })

  it('hides the Invitations and Outgoing requests sections when there are none', async () => {
    vi.mocked(api.me.gyms).mockResolvedValue([])
    render(<MemoryRouter><Profile /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Your profile' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Gym Memberships' }))
    // Tab body renders without Invitations / Outgoing requests headings.
    await screen.findByRole('heading', { name: 'Your gyms' })
    expect(screen.queryByRole('heading', { name: 'Invitations' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Outgoing requests' })).not.toBeInTheDocument()
  })
})
