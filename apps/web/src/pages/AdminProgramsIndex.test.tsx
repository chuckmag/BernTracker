import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, beforeEach, expect } from 'vitest'
import AdminProgramsIndex from './AdminProgramsIndex'
import type { Program } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    admin: {
      programs: { list: vi.fn(), get: vi.fn(), listWorkouts: vi.fn() },
    },
  },
}))

import { api } from '../lib/api'

function makeProgram(overrides: Partial<Program> = {}): Program {
  return {
    id: overrides.id ?? 'p-1',
    name: overrides.name ?? 'CrossFit Mainsite',
    description: overrides.description ?? null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: null,
    coverColor: null,
    visibility: 'PUBLIC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    _count: { members: 0, workouts: 42 },
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/programs']}>
      <AdminProgramsIndex />
    </MemoryRouter>,
  )
}

describe('AdminProgramsIndex', () => {
  beforeEach(() => {
    vi.mocked(api.admin.programs.list).mockResolvedValue([])
  })

  it('renders without crashing', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /Admin · Programs/ })).toBeInTheDocument()
  })

  it('shows the empty state when no unaffiliated programs exist', async () => {
    renderPage()
    expect(await screen.findByText('No unaffiliated programs')).toBeInTheDocument()
  })

  it('lists program cards when the API returns programs', async () => {
    vi.mocked(api.admin.programs.list).mockResolvedValue([
      makeProgram({ id: 'p-1', name: 'CrossFit Mainsite' }),
      makeProgram({ id: 'p-2', name: 'Hero WODs' }),
    ])
    renderPage()
    expect(await screen.findByText('CrossFit Mainsite')).toBeInTheDocument()
    expect(await screen.findByText('Hero WODs')).toBeInTheDocument()
  })
})
