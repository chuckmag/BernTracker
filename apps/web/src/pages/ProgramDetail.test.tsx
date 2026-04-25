import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProgramDetail from './ProgramDetail'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    programs: { get: vi.fn(), update: vi.fn(), delete: vi.fn() },
    gyms: { programs: { create: vi.fn() } },
  },
}))

const mockGymContext = { gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }
vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => mockGymContext,
}))

import { api } from '../lib/api'

function makeGymProgram(overrides: Partial<{ name: string; description: string | null }> = {}) {
  return {
    gymId: 'gym-1',
    programId: 'program-1',
    createdAt: '2026-03-01T00:00:00.000Z',
    program: {
      id: 'program-1',
      name: overrides.name ?? 'Override — March 2026',
      description: overrides.description === undefined ? 'Monthly programming' : overrides.description,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      coverColor: '#6366F1',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      _count: { members: 5, workouts: 31 },
    },
  }
}

function renderPage(id = 'program-1') {
  return render(
    <MemoryRouter initialEntries={[`/programs/${id}`]}>
      <Routes>
        <Route path="/programs/:id" element={<ProgramDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProgramDetail', () => {
  beforeEach(() => {
    mockGymContext.gymRole = 'OWNER'
  })

  it('renders the program name as the heading', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Override — March 2026' })).toBeInTheDocument()
  })

  it('shows the description when present', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ description: 'Custom desc' }))
    renderPage()
    expect(await screen.findByText('Custom desc')).toBeInTheDocument()
  })

  it('renders the Overview tab by default with member and workout counts', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    // counts from fixture: 5 members, 31 workouts
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(await screen.findByText('31')).toBeInTheDocument()
  })

  it('shows the Delete button for OWNER role', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    expect(screen.getByRole('button', { name: /Delete program/ })).toBeInTheDocument()
  })

  it('hides the Delete button for PROGRAMMER role', async () => {
    mockGymContext.gymRole = 'PROGRAMMER'
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    expect(screen.queryByRole('button', { name: /Delete program/ })).not.toBeInTheDocument()
  })

  it('hides the Edit button for COACH role (read-only view)', async () => {
    mockGymContext.gymRole = 'COACH'
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows an error state when the program is not found', async () => {
    vi.mocked(api.programs.get).mockRejectedValue(new Error('Program not found'))
    renderPage()
    expect(await screen.findByText('Program not found')).toBeInTheDocument()
  })
})
