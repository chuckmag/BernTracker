import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import InvitationsBanner from './InvitationsBanner'
import type { PendingInvitation } from '../lib/api'

const mockInvitations = { invitations: [] as PendingInvitation[] }

vi.mock('../context/InvitationsContext.tsx', () => ({
  useInvitations: () => ({
    invitations: mockInvitations.invitations,
    loading: false,
    refresh: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
  }),
}))

function makeMembershipRequest(id: string): PendingInvitation {
  return {
    kind: 'membershipRequest',
    data: {
      id,
      gymId: 'g1',
      direction: 'STAFF_INVITED',
      status: 'PENDING',
      email: 'a@test.com',
      userId: null,
      roleToGrant: 'MEMBER',
      invitedById: 'u-staff',
      decidedById: null,
      decidedAt: null,
      expiresAt: null,
      createdAt: '2026-04-28T00:00:00.000Z',
      updatedAt: '2026-04-28T00:00:00.000Z',
      gym: { id: 'g1', name: 'Test Gym', slug: 'test' },
      invitedBy: { id: 'u-staff', name: 'Coach Jane', firstName: 'Jane', lastName: null, email: 'j@test.com' },
    },
  }
}

describe('InvitationsBanner', () => {
  it('renders nothing when there are no pending invitations', () => {
    mockInvitations.invitations = []
    const { container } = render(<MemoryRouter><InvitationsBanner /></MemoryRouter>)
    expect(container.textContent).toBe('')
  })

  it('renders singular copy with one invitation', () => {
    mockInvitations.invitations = [makeMembershipRequest('i1')]
    render(<MemoryRouter><InvitationsBanner /></MemoryRouter>)
    expect(screen.getByText('You have 1 pending invitation.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View/ })).toHaveAttribute('href', '/profile#invitations')
  })

  it('renders plural copy with multiple invitations', () => {
    mockInvitations.invitations = [makeMembershipRequest('i1'), makeMembershipRequest('i2'), makeMembershipRequest('i3')]
    render(<MemoryRouter><InvitationsBanner /></MemoryRouter>)
    expect(screen.getByText('You have 3 pending invitations.')).toBeInTheDocument()
  })
})
