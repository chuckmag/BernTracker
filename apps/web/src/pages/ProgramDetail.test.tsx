import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProgramDetail from './ProgramDetail'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    programs: {
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      members: {
        list: vi.fn(),
        invite: vi.fn(),
        remove: vi.fn(),
      },
    },
    gyms: {
      programs: { create: vi.fn(), setDefault: vi.fn() },
      members: { list: vi.fn() },
    },
  },
}))

const mockGymContext = { gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }
vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => mockGymContext,
}))

import { api } from '../lib/api'

function makeGymProgram(
  overrides: Partial<{ name: string; description: string | null; visibility: 'PUBLIC' | 'PRIVATE'; isDefault: boolean }> = {},
) {
  return {
    gymId: 'gym-1',
    programId: 'program-1',
    isDefault: overrides.isDefault ?? false,
    createdAt: '2026-03-01T00:00:00.000Z',
    program: {
      id: 'program-1',
      name: overrides.name ?? 'Override — March 2026',
      description: overrides.description === undefined ? 'Monthly programming' : overrides.description,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-31T00:00:00.000Z',
      coverColor: '#6366F1',
      visibility: overrides.visibility ?? 'PRIVATE' as const,
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
    vi.mocked(api.programs.members.list).mockResolvedValue([])
    vi.mocked(api.gyms.members.list).mockResolvedValue([])
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
    // counts from fixture: 5 members, 31 workouts. The "5" appears in two
    // places now (Overview member-count cell + Members-tab badge), so assert
    // on the workout count and the Members-cell button specifically.
    expect(await screen.findByRole('button', { name: '5' })).toBeInTheDocument()
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

  // ─── Members tab (slice 3) ─────────────────────────────────────────────────

  it('shows the Members tab for OWNER and renders the member roster', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    vi.mocked(api.programs.members.list).mockResolvedValue([
      { id: 'u-1', email: 'a@example.com', name: 'Athlete A', role: 'MEMBER', joinedAt: '2026-04-01T00:00:00.000Z' },
      { id: 'u-2', email: 'b@example.com', name: null,        role: 'PROGRAMMER', joinedAt: '2026-04-02T00:00:00.000Z' },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })

    fireEvent.click(screen.getByRole('button', { name: /^members/i }))

    expect(await screen.findByText('Athlete A')).toBeInTheDocument()
    expect(screen.getByText('a@example.com')).toBeInTheDocument()
    expect(screen.getByText('b@example.com')).toBeInTheDocument()
    // Two Remove buttons (one per row) since OWNER can manage
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
  })

  it('hides the Remove button on the Members tab for COACH (read-only)', async () => {
    mockGymContext.gymRole = 'COACH'
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    vi.mocked(api.programs.members.list).mockResolvedValue([
      { id: 'u-1', email: 'a@example.com', name: 'Athlete A', role: 'MEMBER', joinedAt: '2026-04-01T00:00:00.000Z' },
    ])
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })

    fireEvent.click(screen.getByRole('button', { name: /^members/i }))

    await screen.findByText('Athlete A')
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite members' })).not.toBeInTheDocument()
  })

  it('hides the Members tab entirely for MEMBER role', async () => {
    mockGymContext.gymRole = 'MEMBER'
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    // Members count is no longer a button (canSeeMembers === false)
    expect(screen.queryByRole('button', { name: /^members/i })).not.toBeInTheDocument()
  })

  it('opens the Members tab when the Overview member count is clicked (OWNER)', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })

    // Member count "5" rendered as a button on Overview
    fireEvent.click(screen.getByRole('button', { name: '5' }))

    // The Members tab fetch should have been triggered
    await waitFor(() => expect(api.programs.members.list).toHaveBeenCalledWith('program-1'))
  })

  // ─── Visibility badge (slice 4) ────────────────────────────────────────────

  it('renders the 🔒 Private visibility badge by default', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Override — March 2026' })).toBeInTheDocument()
    expect(screen.getByLabelText('Private program')).toBeInTheDocument()
  })

  it('renders the 🌐 Public visibility badge for a PUBLIC program', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC' }))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Override — March 2026' })).toBeInTheDocument()
    expect(screen.getByLabelText('Public program')).toBeInTheDocument()
  })

  // ─── Default badge + Set-as-default toggle (slice 5) ───────────────────────

  it('renders the ⭐ Default badge when GymProgram.isDefault is true', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC', isDefault: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    expect(screen.getByLabelText('Gym default program')).toBeInTheDocument()
  })

  it('shows "Set as gym default" toggle for OWNER on a PUBLIC non-default program', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC' }))
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    const button = screen.getByRole('button', { name: /Set as gym default/ })
    expect(button).toBeEnabled()
  })

  it('disables the Set-as-default toggle when the program is PRIVATE', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PRIVATE' }))
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    const button = screen.getByRole('button', { name: /Set as gym default/ })
    expect(button).toBeDisabled()
    // Hint copy explains why (the OverviewTab variant — the drawer also
    // mentions the rule but with shorter copy).
    expect(
      screen.getByText(/Default programs must be public\. Change visibility first\./),
    ).toBeInTheDocument()
  })

  it('shows "⭐ Gym default" (disabled) when the program is already default', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC', isDefault: true }))
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    const button = screen.getByRole('button', { name: /Gym default/ })
    expect(button).toBeDisabled()
  })

  it('hides the Set-as-default toggle for non-OWNER roles', async () => {
    mockGymContext.gymRole = 'PROGRAMMER'
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC' }))
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })
    expect(screen.queryByRole('button', { name: /Set as gym default/ })).not.toBeInTheDocument()
  })

  it('calls api.gyms.programs.setDefault and reloads on click', async () => {
    vi.mocked(api.programs.get).mockResolvedValue(makeGymProgram({ visibility: 'PUBLIC' }))
    vi.mocked(api.gyms.programs.setDefault).mockResolvedValue(undefined as never)
    renderPage()
    await screen.findByRole('heading', { name: 'Override — March 2026' })

    fireEvent.click(screen.getByRole('button', { name: /Set as gym default/ }))

    await waitFor(() => expect(api.gyms.programs.setDefault).toHaveBeenCalledWith('gym-1', 'program-1'))
    // Reload triggers a second `get`
    await waitFor(() => expect(vi.mocked(api.programs.get).mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
