import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import PublicProfile from './PublicProfile'

vi.mock('../lib/api', () => ({
  api: {
    users: {
      public: vi.fn(),
    },
  },
}))

import { api } from '../lib/api'

function makeProfile(overrides = {}) {
  return {
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    name: null,
    avatarUrl: null,
    ...overrides,
  }
}

function renderPage(userId = 'user-1') {
  return render(
    <MemoryRouter initialEntries={[`/users/${userId}`]}>
      <Routes>
        <Route path="/users/:userId" element={<PublicProfile />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing and shows display name after load', async () => {
    vi.mocked(api.users.public).mockResolvedValue(makeProfile())
    renderPage()
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
  })

  it('falls back to name field when firstName/lastName are null', async () => {
    vi.mocked(api.users.public).mockResolvedValue(
      makeProfile({ firstName: null, lastName: null, name: 'jdoe' }),
    )
    renderPage()
    expect(await screen.findByText('jdoe')).toBeInTheDocument()
  })

  it('shows error message when the API rejects', async () => {
    vi.mocked(api.users.public).mockRejectedValue(new Error('User not found'))
    renderPage()
    expect(await screen.findByText('User not found')).toBeInTheDocument()
  })

  it('renders a back button', async () => {
    vi.mocked(api.users.public).mockResolvedValue(makeProfile())
    renderPage()
    expect(await screen.findByRole('button', { name: /back/i })).toBeInTheDocument()
  })
})
