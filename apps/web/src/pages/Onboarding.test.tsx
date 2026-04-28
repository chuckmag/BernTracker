import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Onboarding from './Onboarding'
import type { UserProfile } from '../lib/api'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.users.me.profile.get).mockResolvedValue(newProfile)
})

describe('Onboarding page', () => {
  it('renders step 1 by default with name fields', async () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /set up your profile/i })).toBeInTheDocument()
    expect(screen.getByText('Your name')).toBeInTheDocument()
    // Avatar placeholder is visible from the start
    expect(screen.getByText(/Coming soon/)).toBeInTheDocument()
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
})
