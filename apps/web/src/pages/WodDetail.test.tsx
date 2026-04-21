import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WodDetail from './WodDetail'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    workouts: { get: vi.fn() },
    results: { leaderboard: vi.fn() },
  },
  TYPE_ABBR: {
    STRENGTH: 'S', FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C',
    AMRAP: 'A', METCON: 'M', WARMUP: 'W',
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Test User' } }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { api } from '../lib/api'

function makeWorkout(overrides = {}) {
  return {
    id: 'workout-1',
    title: 'Test Workout',
    description: '3 rounds',
    type: 'FOR_TIME' as const,
    status: 'PUBLISHED' as const,
    scheduledAt: '2026-07-15T12:00:00.000Z',
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    _count: { results: 0 },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage(workoutId = 'workout-1') {
  return render(
    <MemoryRouter initialEntries={[`/workouts/${workoutId}`]}>
      <Routes>
        <Route path="/workouts/:id" element={<WodDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WodDetail', () => {
  beforeEach(() => {
    vi.mocked(api.results.leaderboard).mockResolvedValue([])
  })

  it('renders the page when workoutMovements is empty', async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Test Workout' })).toBeInTheDocument()
  })

  it('renders movement chips when workoutMovements is present', async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(
      makeWorkout({
        workoutMovements: [
          { movement: { id: 'm-1', name: 'Thruster', parentId: null } },
          { movement: { id: 'm-2', name: 'Pull-up', parentId: null } },
        ],
      }),
    )
    renderPage()
    expect(await screen.findByText('Thruster')).toBeInTheDocument()
    expect(await screen.findByText('Pull-up')).toBeInTheDocument()
  })

  it('renders without crashing when API returns a workout with no movements field', async () => {
    // Simulates the pre-fix state: API response has workoutMovements undefined
    // (e.g. an older API version or a missing include). Page must not throw.
    vi.mocked(api.workouts.get).mockResolvedValue(
      makeWorkout({ workoutMovements: undefined }),
    )
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Test Workout' })).toBeInTheDocument()
  })
})
