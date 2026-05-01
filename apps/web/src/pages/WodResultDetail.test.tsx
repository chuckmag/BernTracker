import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WodResultDetail from './WodResultDetail'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    workouts: { get: vi.fn() },
    results: { leaderboard: vi.fn() },
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

import { api } from '../lib/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkout(overrides = {}) {
  return {
    id: 'workout-1',
    title: 'Fran',
    description: '21-15-9 Thrusters and Pull-ups',
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

function makeResult(overrides: {
  id: string
  userId: string
  name: string
  notes?: string | null
  avatarUrl?: string | null
}) {
  const [first, ...rest] = overrides.name.split(' ')
  return {
    id: overrides.id,
    userId: overrides.userId,
    workoutId: 'workout-1',
    user: {
      id: overrides.userId,
      name: overrides.name,
      firstName: first ?? null,
      lastName: rest.join(' ') || null,
      email: `${overrides.userId}@test.com`,
      avatarUrl: overrides.avatarUrl ?? null,
    },
    level: 'RX' as const,
    workoutGender: 'OPEN' as const,
    value: { score: { kind: 'TIME', seconds: 305, cappedOut: false }, movementResults: [] },
    notes: overrides.notes ?? null,
    createdAt: '2026-04-01T00:00:00.000Z',
    workout: { type: 'FOR_TIME' as const },
  }
}

function renderPage(workoutId = 'workout-1', resultId = 'r-1') {
  return render(
    <MemoryRouter initialEntries={[`/workouts/${workoutId}/results/${resultId}`]}>
      <Routes>
        <Route path="/workouts/:id/results/:resultId" element={<WodResultDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WodResultDetail', () => {
  beforeEach(() => {
    vi.mocked(api.workouts.get).mockReset()
    vi.mocked(api.results.leaderboard).mockReset()
    mockUseAuth.mockReturnValue({ user: { id: 'viewer-1' } })
  })

  it("shows 'Your Result' when the result belongs to the current user", async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeResult({ id: 'r-mine', userId: 'viewer-1', name: 'Test User' }),
    ] as never)

    renderPage('workout-1', 'r-mine')
    expect(await screen.findByRole('heading', { name: 'Your Result' })).toBeInTheDocument()
  })

  it("shows '<name>'s Result' when viewing another athlete", async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeResult({ id: 'r-other', userId: 'somebody-else', name: 'Jane Doe' }),
    ] as never)

    renderPage('workout-1', 'r-other')
    expect(await screen.findByRole('heading', { name: "Jane Doe's Result" })).toBeInTheDocument()
  })

  it('renders the workout description, formatted result, level, and notes', async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeResult({
        id: 'r-1',
        userId: 'somebody-else',
        name: 'Jane Doe',
        notes: 'Felt strong on thrusters; chipped through pull-ups.',
      }),
    ] as never)

    renderPage('workout-1', 'r-1')
    // Workout context is rendered for read-only review
    expect(await screen.findByRole('heading', { name: 'Fran' })).toBeInTheDocument()
    expect(screen.getByText(/21-15-9/)).toBeInTheDocument()
    // Formatted FOR_TIME result
    expect(screen.getByText('5:05')).toBeInTheDocument()
    // Level + notes
    expect(screen.getByText('RX')).toBeInTheDocument()
    expect(screen.getByText(/Felt strong on thrusters/)).toBeInTheDocument()
  })

  it('falls back to a friendly empty notes message when the result has no notes', async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeResult({ id: 'r-1', userId: 'somebody-else', name: 'Jane Doe' }),
    ] as never)

    renderPage('workout-1', 'r-1')
    expect(await screen.findByText('No notes for this result.')).toBeInTheDocument()
  })

  it('shows an error when the result cannot be located on the leaderboard', async () => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue([] as never)

    renderPage('workout-1', 'missing-result-id')
    expect(await screen.findByText(/Result not found/i)).toBeInTheDocument()
  })
})
