import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import AdminMovements from './AdminMovements'

vi.mock('../lib/api', () => ({
  api: {
    movements: {
      pending: vi.fn(),
      update: vi.fn(),
      review: vi.fn(),
    },
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [],
}))

import { api } from '../lib/api'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/movements']}>
      <AdminMovements />
    </MemoryRouter>,
  )
}

describe('AdminMovements', () => {
  beforeEach(() => {
    vi.mocked(api.movements.pending).mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /Settings · Movements/ })).toBeInTheDocument()
  })

  it('shows the empty state when no pending movements', async () => {
    renderPage()
    expect(await screen.findByText('No pending movements')).toBeInTheDocument()
  })

  it('lists pending movements with Edit / Approve / Reject affordances', async () => {
    vi.mocked(api.movements.pending).mockResolvedValue([
      { id: 'm-1', name: 'Kipping HSPU', status: 'PENDING', parentId: null },
      { id: 'm-2', name: 'Strict Pull-up', status: 'PENDING', parentId: null },
    ])
    renderPage()
    expect(await screen.findByText('Kipping HSPU')).toBeInTheDocument()
    expect(screen.getByText('Strict Pull-up')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(2)
  })
})
