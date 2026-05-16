import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './Dashboard'
import type { DashboardToday, GymProgram } from '../lib/api'

// jsdom doesn't implement localStorage — stub it.
const localStorageStore: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { localStorageStore[key] = val }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key] }),
}

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
      results: {
        ...actual.api.results,
        leaderboard: vi.fn().mockResolvedValue([]),
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
  useProgramFilter: vi.fn(),
  PERSONAL_PROGRAM_SENTINEL: '__personal__',
}))

const defaultFilterValue = {
  available: [] as GymProgram[],
  selected: [],
  gymProgramIds: [],
  personalProgramId: null,
  defaultProgramId: null as string | null,
  loading: false,
  setSelected: vi.fn(),
  toggle: vi.fn(),
  clear: vi.fn(),
}

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
    vi.stubGlobal('localStorage', localStorageMock)
    vi.clearAllMocks()
    // Re-attach store lookups after clearAllMocks resets the implementations.
    localStorageMock.getItem.mockImplementation((key: string) => localStorageStore[key] ?? null)
    localStorageMock.setItem.mockImplementation((key: string, val: string) => { localStorageStore[key] = val })
    localStorageMock.removeItem.mockImplementation((key: string) => { delete localStorageStore[key] })
    delete localStorageStore['dashboardProgram:gym-1']
    const { useGym } = await import('../context/GymContext')
    vi.mocked(useGym).mockReturnValue(defaultGym)
    const { useProgramFilter } = await import('../context/ProgramFilterContext')
    vi.mocked(useProgramFilter).mockReturnValue(defaultFilterValue)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const emptyDashboard: DashboardToday = { workouts: [], gymMemberCount: 0 }

  const franWorkout = {
    id: 'w1',
    title: 'Fran',
    description: '21-15-9: Thrusters, Pull-ups',
    coachNotes: null,
    type: 'FOR_TIME' as const,
    status: 'PUBLISHED' as const,
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
  }

  it('renders greeting with first name', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue(emptyDashboard satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText(/Good .+, Alex/)).toBeInTheDocument()
  })

  it('renders empty state when no workout today', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue(emptyDashboard satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('No workout today')).toBeInTheDocument()
  })

  it('renders WodHeroCard when workout present', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workouts: [{
        workout: franWorkout,
        myResult: null,
        leaderboard: { rank: null, totalLogged: 5, percentile: null },
        programSubscriberCount: 0,
        isHeroWorkoutGymAffiliated: true,
      }],
      gymMemberCount: 30,
    } satisfies DashboardToday)

    renderDashboard()
    expect(await screen.findByText('Fran')).toBeInTheDocument()
  })

  it('pre-selects the first non-recovery workout when warmup appears first', async () => {
    const { api } = await import('../lib/api')
    const warmupWorkout = { ...franWorkout, id: 'w0', title: 'Daily Warm Up', type: 'WARMUP' as const }
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workouts: [
        { workout: warmupWorkout, myResult: null, leaderboard: null, programSubscriberCount: 0, isHeroWorkoutGymAffiliated: true },
        { workout: franWorkout, myResult: null, leaderboard: { rank: null, totalLogged: 5, percentile: null }, programSubscriberCount: 0, isHeroWorkoutGymAffiliated: true },
      ],
      gymMemberCount: 30,
    } satisfies DashboardToday)

    renderDashboard()
    // Fran (the non-recovery workout) should be visible in the hero heading
    expect(await screen.findByRole('heading', { name: 'Fran' })).toBeInTheDocument()
    // Warm Up tab should exist but not be the selected content
    expect(screen.queryByRole('heading', { name: 'Daily Warm Up' })).not.toBeInTheDocument()
  })

  it('does not crash when API returns old flat shape (defensive compat)', async () => {
    const { api } = await import('../lib/api')
    // Simulate old API shape missing the workouts array
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue(
      { gymMemberCount: 0 } as unknown as DashboardToday,
    )

    renderDashboard()
    expect(await screen.findByText('No workout today')).toBeInTheDocument()
  })

  it('shows Hot Today card when workout is present', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.gyms.dashboard.today).mockResolvedValue({
      workouts: [{
        workout: { ...franWorkout, _count: { results: 0 } },
        myResult: null,
        leaderboard: null,
        programSubscriberCount: 0,
        isHeroWorkoutGymAffiliated: true,
      }],
      gymMemberCount: 0,
    } satisfies DashboardToday)
    vi.mocked(api.results.leaderboard).mockResolvedValue([])

    renderDashboard()
    expect(await screen.findByText(/Hot Today/i)).toBeInTheDocument()
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

  describe('program selection persistence', () => {
    const twoPrograms: GymProgram[] = [
      { gymId: 'gym-1', programId: 'prog-1', isDefault: false, createdAt: '', program: { id: 'prog-1', name: 'Program One', description: null, startDate: '', endDate: null, coverColor: null, visibility: 'PUBLIC', createdAt: '', updatedAt: '' } },
      { gymId: 'gym-1', programId: 'prog-2', isDefault: false, createdAt: '', program: { id: 'prog-2', name: 'Program Two', description: null, startDate: '', endDate: null, coverColor: null, visibility: 'PUBLIC', createdAt: '', updatedAt: '' } },
    ]

    function makeFilter(overrides: Partial<typeof defaultFilterValue>) {
      return { ...defaultFilterValue, ...overrides }
    }

    it('does not call dashboard API while filter is loading', async () => {
      const { useProgramFilter } = await import('../context/ProgramFilterContext')
      vi.mocked(useProgramFilter).mockReturnValue(makeFilter({ loading: true }))
      const { api } = await import('../lib/api')

      renderDashboard()
      // Give effects a chance to run
      await new Promise((r) => setTimeout(r, 50))
      expect(api.gyms.dashboard.today).not.toHaveBeenCalled()
    })

    it('calls API with stored programId after filter finishes loading', async () => {
      localStorage.setItem('dashboardProgram:gym-1', 'prog-2')

      const { useProgramFilter } = await import('../context/ProgramFilterContext')
      const { api } = await import('../lib/api')
      vi.mocked(api.gyms.dashboard.today).mockResolvedValue(emptyDashboard satisfies DashboardToday)

      // Start loading
      vi.mocked(useProgramFilter).mockReturnValue(makeFilter({ loading: true, available: [] }))
      const { rerender } = renderDashboard()

      // Simulate filter load completing with programs available
      vi.mocked(useProgramFilter).mockReturnValue(makeFilter({ loading: false, available: twoPrograms }))
      rerender(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes><Route path="/dashboard" element={<Dashboard />} /></Routes>
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(api.gyms.dashboard.today).toHaveBeenCalledWith('gym-1', ['prog-2'])
      })
    })

    it('falls back to defaultProgramId and persists it when no stored preference', async () => {
      const { useProgramFilter } = await import('../context/ProgramFilterContext')
      const { api } = await import('../lib/api')
      vi.mocked(api.gyms.dashboard.today).mockResolvedValue(emptyDashboard satisfies DashboardToday)

      vi.mocked(useProgramFilter).mockReturnValue(makeFilter({ loading: true, available: [] }))
      const { rerender } = renderDashboard()

      const programsWithDefault = twoPrograms.map((p) => ({ ...p, isDefault: p.programId === 'prog-1' }))
      vi.mocked(useProgramFilter).mockReturnValue(makeFilter({ loading: false, available: programsWithDefault, defaultProgramId: 'prog-1' }))
      rerender(
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes><Route path="/dashboard" element={<Dashboard />} /></Routes>
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(api.gyms.dashboard.today).toHaveBeenCalledWith('gym-1', ['prog-1'])
      })
      // Verify default was written to storage so the next refresh re-applies it
      expect(localStorage.getItem('dashboardProgram:gym-1')).toBe('prog-1')
    })
  })
})
