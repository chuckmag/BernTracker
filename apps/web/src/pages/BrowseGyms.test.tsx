import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import BrowseGyms from './BrowseGyms'
import type { BrowseGym } from '../lib/api'

const sampleGyms: BrowseGym[] = [
  { id: 'g1', name: 'Crossfit Alpha', slug: 'alpha', timezone: 'UTC', memberCount: 12, callerStatus: 'NONE', logoUrl: null },
  { id: 'g2', name: 'Crossfit Beta', slug: 'beta', timezone: 'UTC', memberCount: 4, callerStatus: 'REQUEST_PENDING', logoUrl: null },
  { id: 'g3', name: 'Crossfit Gamma', slug: 'gamma', timezone: 'UTC', memberCount: 99, callerStatus: 'MEMBER', logoUrl: null },
]

vi.mock('../lib/api', () => ({
  api: {
    gyms: {
      browse: vi.fn(),
      joinRequest: {
        create: vi.fn(),
        cancel: vi.fn(),
      },
    },
  },
}))

import { api } from '../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.gyms.browse).mockResolvedValue(sampleGyms)
})

describe('BrowseGyms', () => {
  it('renders gym rows with the correct CTA per callerStatus', async () => {
    render(<MemoryRouter><BrowseGyms /></MemoryRouter>)
    expect(await screen.findByText('Crossfit Alpha')).toBeInTheDocument()
    expect(screen.getByText('Crossfit Beta')).toBeInTheDocument()
    expect(screen.getByText('Crossfit Gamma')).toBeInTheDocument()

    // NONE → "Request to join" button
    expect(screen.getByRole('button', { name: /Request to join/ })).toBeInTheDocument()
    // REQUEST_PENDING → status pill + Cancel button
    expect(screen.getByText('Request pending')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument()
    // MEMBER → status pill, no buttons
    expect(screen.getByText('Already a member')).toBeInTheDocument()
  })

  it('clicking Request to join calls api.gyms.joinRequest.create with the gymId', async () => {
    vi.mocked(api.gyms.joinRequest.create).mockResolvedValue({} as never)
    render(<MemoryRouter><BrowseGyms /></MemoryRouter>)
    await screen.findByText('Crossfit Alpha')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Request to join/ }))
    await waitFor(() => expect(api.gyms.joinRequest.create).toHaveBeenCalledWith('g1'))
  })

  it('shows EmptyState when search returns nothing', async () => {
    vi.mocked(api.gyms.browse).mockResolvedValue([])
    render(<MemoryRouter><BrowseGyms /></MemoryRouter>)
    expect(await screen.findByText(/No gyms found/)).toBeInTheDocument()
  })
})
