import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Onboarding from './Onboarding'
import type { UserProfile, PendingInvitation } from '../lib/api'

const newProfile: UserProfile = {
  id: 'u1',
  email: 'new@test.com',
  name: null,
  firstName: null,
  lastName: null,
  birthday: null,
  avatarUrl: null,
  onboardedAt: null,
  role: 'MEMBER',
  identifiedGender: null,
  emergencyContacts: [],
}

vi.mock('../lib/api', () => ({
  api: {
    users: {
      me: {
        profile: { get: vi.fn(), update: vi.fn() },
        emergencyContacts: { create: vi.fn(), remove: vi.fn() },
        invitations: {
          pendingAll: vi.fn().mockResolvedValue([]),
          accept: vi.fn(),
          decline: vi.fn(),
        },
        codeInvitations: {
          accept: vi.fn(),
          decline: vi.fn(),
        },
      },
    },
    auth: { me: vi.fn() },
  },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'new@test.com' },
    accessToken: 'tok',
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

import { api } from '../lib/api'

function makePendingGymInvitation(id: string): PendingInvitation {
  return {
    kind: 'membershipRequest',
    data: {
      id,
      gymId: 'g1',
      direction: 'STAFF_INVITED',
      status: 'PENDING',
      email: 'new@test.com',
      userId: null,
      roleToGrant: 'MEMBER',
      invitedById: 'u-coach',
      decidedById: null,
      decidedAt: null,
      expiresAt: null,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      gym: { id: 'g1', name: 'Iron Forge', slug: 'iron-forge' },
      invitedBy: { id: 'u-coach', name: 'Coach Sam', firstName: 'Sam', lastName: null, email: 's@ironforge.com' },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.users.me.profile.get).mockResolvedValue(newProfile)
  vi.mocked(api.users.me.profile.update).mockResolvedValue({ ...newProfile, onboardedAt: '2026-05-03T00:00:00.000Z' })
  vi.mocked(api.auth.me).mockResolvedValue({ id: 'u1', email: 'new@test.com', name: null, firstName: null, lastName: null, avatarUrl: null, birthday: null, onboardedAt: '2026-05-03T00:00:00.000Z', role: 'MEMBER', identifiedGender: null, isWodalyticsAdmin: false })
  vi.mocked(api.users.me.invitations.pendingAll).mockResolvedValue([])
})

describe('Onboarding page', () => {
  it('renders step 1 by default with name fields', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /set up your profile/i })).toBeInTheDocument()
    expect(screen.getByText('Your name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload photo/ })).toBeInTheDocument()
  })

  it('blocks Continue on step 1 when names are empty', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    await screen.findByText('Your name')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    expect(await screen.findByText(/First and last name are required/)).toBeInTheDocument()
  })

  it('redirects to /feed when user is already onboarded', async () => {
    vi.mocked(api.users.me.profile.get).mockResolvedValue({ ...newProfile, onboardedAt: '2026-01-01T00:00:00.000Z' })
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true }))
  })

  it('navigates to /feed when no gym invitations after profile save', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    await screen.findByText('Your name')

    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    await screen.findByText('About you')
    await user.type(screen.getByLabelText(/birthday/i), '1995-06-15')
    await user.click(screen.getByRole('button', { name: /Finish/ }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/feed', { replace: true }))
  })

  it('shows invitations step when pending gym invitations exist', async () => {
    vi.mocked(api.users.me.invitations.pendingAll).mockResolvedValue([makePendingGymInvitation('inv1')])
    const user = userEvent.setup()
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    await screen.findByText('Your name')

    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    await screen.findByText('About you')
    await user.type(screen.getByLabelText(/birthday/i), '1995-06-15')
    await user.click(screen.getByRole('button', { name: /Finish/ }))

    // Step 3 should appear with gym invitation
    expect(await screen.findByText('Join a gym')).toBeInTheDocument()
    expect(await screen.findByText('Iron Forge')).toBeInTheDocument()
  })
})
