import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JoinInvitation from './JoinInvitation'
import type { InvitationLookup } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    gyms: {
      codeInvitations: {
        lookup: vi.fn(),
      },
    },
  },
}))

import { api } from '../lib/api'

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 1000).toISOString()

function makeInvite(overrides: Partial<InvitationLookup> = {}): InvitationLookup {
  return {
    code: 'ABC123',
    channel: 'EMAIL',
    gymId: 'g1',
    gym: { id: 'g1', name: 'Iron Forge', slug: 'iron-forge' },
    invitedBy: { id: 'u1', firstName: 'Coach', lastName: 'Sam' },
    roleToGrant: 'MEMBER',
    expiresAt: FUTURE,
    ...overrides,
  }
}

function renderAt(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinInvitation />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('JoinInvitation', () => {
  it('shows gym name, role, and inviter when invite is found', async () => {
    vi.mocked(api.gyms.codeInvitations.lookup).mockResolvedValue(makeInvite())
    renderAt('ABC123')
    expect(await screen.findByText('Iron Forge')).toBeInTheDocument()
    expect(screen.getByText(/Member/)).toBeInTheDocument()
    expect(screen.getByText(/Coach Sam/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Create account/ })).toHaveAttribute('href', '/register?invite=ABC123')
    expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/login?invite=ABC123')
  })

  it('shows not-found state when the API returns a 404-style error', async () => {
    vi.mocked(api.gyms.codeInvitations.lookup).mockRejectedValue(new Error('404 not found'))
    renderAt('BADCODE')
    expect(await screen.findByText(/Invitation not found/)).toBeInTheDocument()
  })

  it('shows expired state when the API returns a 410-style error', async () => {
    vi.mocked(api.gyms.codeInvitations.lookup).mockRejectedValue(new Error('410 expired'))
    renderAt('OLDCODE')
    expect(await screen.findByText(/Invitation expired or revoked/)).toBeInTheDocument()
  })

  it('shows expired state when expiresAt is in the past', async () => {
    vi.mocked(api.gyms.codeInvitations.lookup).mockResolvedValue(makeInvite({ expiresAt: PAST }))
    renderAt('ABC123')
    expect(await screen.findByText(/Invitation expired or revoked/)).toBeInTheDocument()
  })

  it('shows WODalytics as the gym name when gymId is null', async () => {
    vi.mocked(api.gyms.codeInvitations.lookup).mockResolvedValue(makeInvite({ gymId: null, gym: null }))
    renderAt('ABC123')
    await waitFor(() => expect(screen.queryByText('Looking up your invitation…')).not.toBeInTheDocument())
    // The page header always says "WODalytics"; the card body also says it when there's no gym
    expect(screen.getAllByText('WODalytics').length).toBeGreaterThanOrEqual(2)
  })
})
