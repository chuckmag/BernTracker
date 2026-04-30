import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Extend the vitest expect with jest-axe's matcher.
expect.extend(toHaveNoViolations)

// ─── Module mocks ────────────────────────────────────────────────────────────
//
// One shared mock surface keeps the test self-contained. Each page resolves
// its API calls before axe runs so we exercise the loaded UI, not the
// loading skeletons.

vi.mock('../lib/api', () => ({
  api: {
    workouts: { list: vi.fn(), get: vi.fn() },
    results: { leaderboard: vi.fn(), history: vi.fn() },
    gyms: { programs: { list: vi.fn() } },
    programs: { get: vi.fn() },
    namedWorkouts: { list: vi.fn() },
    movements: { list: vi.fn(), detect: vi.fn() },
  },
}))

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => ({ gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Test User' } }),
}))

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Test User' } }),
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [],
}))

// Program filter is irrelevant to the page-level a11y checks — stub it as
// "no programs selected, none available". Each page falls through to its
// no-filter rendering path.
vi.mock('../context/ProgramFilterContext.tsx', () => ({
  useProgramFilter: () => ({
    selected: [], available: [], loading: false,
    setSelected: vi.fn(), toggle: vi.fn(), clear: vi.fn(),
  }),
  ProgramFilterProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// The sidebar mounts the picker; render it as null in a11y tests.
vi.mock('../components/ProgramFilterPicker', () => ({ default: () => null }))
vi.mock('../components/ProgramFilterPicker.tsx', () => ({ default: () => null }))

// WorkoutDrawer/LogResultDrawer pull in their own subtrees that are out of
// scope for these page-level a11y checks; render them as null so each page
// renders cleanly without dragging in unrelated DOM.
vi.mock('../components/WorkoutDrawer', () => ({ default: () => null }))
vi.mock('../components/LogResultDrawer.tsx', () => ({ default: () => null }))

import { api } from '../lib/api'
import Feed from '../pages/Feed'
import Calendar from '../pages/Calendar'
import WodDetail from '../pages/WodDetail'
import History from '../pages/History'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeWorkout(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workout-1',
    title: 'Test Workout',
    description: 'Do the thing',
    type: 'FOR_TIME' as const,
    status: 'PUBLISHED' as const,
    scheduledAt: '2026-04-15T12:00:00.000Z',
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    _count: { results: 0 },
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    userId: 'u-1',
    user: { id: 'u-1', name: 'Athlete A', firstName: 'Athlete', lastName: 'A', email: 'athlete-a@test.com', avatarUrl: null },
    level: 'RX' as const,
    workoutGender: 'OPEN' as const,
    value: { seconds: 300, cappedOut: false },
    notes: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    workout: { id: 'workout-1', type: 'FOR_TIME' as const, scheduledAt: '2026-04-15T12:00:00.000Z', title: 'Test Workout' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.workouts.list).mockResolvedValue([makeWorkout()] as never)
  vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout() as never)
  vi.mocked(api.results.leaderboard).mockResolvedValue([makeResult()] as never)
  vi.mocked(api.results.history).mockResolvedValue({ results: [makeResult()], pages: 1 } as never)
  vi.mocked(api.gyms.programs.list).mockResolvedValue([] as never)
  vi.mocked(api.namedWorkouts.list).mockResolvedValue([] as never)
  vi.mocked(api.movements.list).mockResolvedValue([] as never)
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('a11y — page renders have no axe violations', () => {
  it('Feed', async () => {
    const { container } = render(
      <MemoryRouter>
        <Feed />
      </MemoryRouter>,
    )
    await screen.findByText('Test Workout')
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('Calendar', async () => {
    const { container } = render(
      <MemoryRouter>
        <Calendar />
      </MemoryRouter>,
    )
    // Wait for the calendar grid to render (day-of-week header is synchronous).
    await screen.findByText('Sun')
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('WodDetail', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/workouts/workout-1']}>
        <Routes>
          <Route path="/workouts/:id" element={<WodDetail />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Test Workout' })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('History', async () => {
    const { container } = render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    )
    await screen.findByText('Test Workout')
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
