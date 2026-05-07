import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import type { DashboardToday } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      gyms: {
        ...actual.api.gyms,
        dashboard: {
          today: vi.fn(),
        },
      },
    },
  }
})

const defaultGym = {
  gymId: 'gym-1',
  gymRole: 'MEMBER' as const,
  gyms: [],
  setGymId: vi.fn(),
  refreshGyms: vi.fn(),
  loading: false,
  clearGymId: vi.fn(),
}

vi.mock('../context/GymContext', () => ({
  useGym: vi.fn(() => defaultGym),
}))

vi.mock('../context/ProgramFilterContext', () => ({
  useProgramFilter: () => ({ available: [], selected: [], gymProgramIds: [], personalProgramId: null, defaultProgramId: null, setSelected: vi.fn() }),
  PERSONAL_PROGRAM_SENTINEL: '__personal__',
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Alex', firstName: 'Alex' } }),
}))

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Dashboard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { useGym } = await import('../context/GymContext')
    vi.mocked(useGym).mockReturnValue(defaultGym)
  })

  it('renders greeting with first name', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workout: null,
      myResult: null,
      leaderboard: null,
      gymMemberCount: 0,
      programSubscriberCount: 0,
      isHeroWorkoutGymAffiliated: true,
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText(/Good .+, Alex/)).toBeInTheDocument()
  })

  it('renders empty state when no workout today', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workout: null,
      myResult: null,
      leaderboard: null,
      gymMemberCount: 0,
      programSubscriberCount: 0,
      isHeroWorkoutGymAffiliated: true,
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('No workout today')).toBeInTheDocument()
  })

  it('renders WodHeroCard when workout present', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workout: {
        id: 'w1',
        title: 'Fran',
        description: '21-15-9: Thrusters, Pull-ups',
        coachNotes: null,
        type: 'FOR_TIME',
        status: 'PUBLISHED',
        scheduledAt: new Date().toISOString(),
        dayOrder: 0,
        workoutMovements: [],
        programId: null,
        program: null,
        namedWorkoutId: null,
        namedWorkout: null,
        timeCapSeconds: null,
        tracksRounds: false,
        _count: { results: 5 },
        externalSourceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      myResult: null,
      leaderboard: { rank: null, totalLogged: 5, percentile: null },
      gymMemberCount: 30,
      programSubscriberCount: 0,
      isHeroWorkoutGymAffiliated: true,
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('Fran')).toBeInTheDocument()
  })

  it('shows social placeholder tile', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workout: null,
      myResult: null,
      leaderboard: null,
      gymMemberCount: 0,
      programSubscriberCount: 0,
      isHeroWorkoutGymAffiliated: true,
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('Social feed coming soon')).toBeInTheDocument()
  })

  it('shows no-gym CTA card when user has no gym', async () => {
    const { useGym } = await import('../context/GymContext')
    vi.mocked(useGym).mockReturnValue({
      ...defaultGym,
      gymId: null,
      gymRole: null,
      loading: false,
    })

    renderDashboard()
    expect(await screen.findByText("You're not part of a gym yet")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse programs' })).toBeInTheDocument()
  })

  it('does not call dashboard API when no gymId', async () => {
    const { useGym } = await import('../context/GymContext')
    vi.mocked(useGym).mockReturnValue({ ...defaultGym, gymId: null, gymRole: null, loading: false })
    const { api } = await import('../lib/api')

    renderDashboard()
    await screen.findByText("You're not part of a gym yet")
    expect(api.gyms.dashboard.today).not.toHaveBeenCalled()
  })
})
