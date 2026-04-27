import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProgramsIndex from './ProgramsIndex'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    gyms: {
      programs: { list: vi.fn() },
    },
  },
}))

const mockGymContext = { gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }
vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => mockGymContext,
}))

import { api } from '../lib/api'

function makeGymProgram(overrides: Partial<{ id: string; name: string; memberCount: number; workoutCount: number; coverColor: string | null }> = {}) {
  const id = overrides.id ?? 'program-1'
  return {
    gymId: 'gym-1',
    programId: id,
    createdAt: '2026-03-01T00:00:00.000Z',
    program: {
      id,
      name: overrides.name ?? 'Override — March 2026',
      description: null,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: null,
      coverColor: overrides.coverColor ?? null,
      visibility: 'PRIVATE' as const,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      _count: {
        members: overrides.memberCount ?? 3,
        workouts: overrides.workoutCount ?? 12,
      },
    },
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/programs']}>
      <ProgramsIndex />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProgramsIndex', () => {
  beforeEach(() => {
    mockGymContext.gymRole = 'OWNER'
    vi.mocked(api.gyms.programs.list).mockResolvedValue([])
  })

  it('renders the heading when the API returns no programs', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Programs' })).toBeInTheDocument()
  })

  it('shows the empty state when there are no programs', async () => {
    renderPage()
    expect(await screen.findByText('No programs yet')).toBeInTheDocument()
  })

  it('lists program cards when the API returns programs', async () => {
    vi.mocked(api.gyms.programs.list).mockResolvedValue([
      makeGymProgram({ id: 'p-1', name: 'Main Class' }),
      makeGymProgram({ id: 'p-2', name: 'Comp Team' }),
    ])
    renderPage()
    expect(await screen.findByText('Main Class')).toBeInTheDocument()
    expect(await screen.findByText('Comp Team')).toBeInTheDocument()
  })

  it('shows the "+ New Program" button for OWNER role', async () => {
    renderPage()
    const buttons = await screen.findAllByRole('button', { name: /New Program/ })
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('hides the "+ New Program" button for MEMBER role', async () => {
    mockGymContext.gymRole = 'MEMBER'
    renderPage()
    await screen.findByText('No programs yet')
    expect(screen.queryByRole('button', { name: /New Program/ })).not.toBeInTheDocument()
  })
})
