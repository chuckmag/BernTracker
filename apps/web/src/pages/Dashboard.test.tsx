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

vi.mock('../context/GymContext', () => ({
  useGym: () => ({ gymId: 'gym-1', gymRole: 'MEMBER', gyms: [], setGymId: vi.fn(), refreshGyms: vi.fn(), loading: false }),
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders greeting with first name', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workout: null,
      myResult: null,
      leaderboard: null,
      gymMemberCount: 0,
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
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('Social feed coming soon')).toBeInTheDocument()
  })
})
