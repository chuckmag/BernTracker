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
    timeCapSeconds: null,
    tracksRounds: false,
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

  it('renders the full per-movement set breakdown for a strength result', async () => {
    const strengthWorkout = {
      ...makeWorkout({
        title: 'Back Squat 5×5',
        type: 'STRENGTH' as const,
        description: '5x5 Back Squat',
      }),
      workoutMovements: [
        {
          movement: { id: 'm-back-squat', name: 'Back Squat', parentId: null },
          displayOrder: 0,
          sets: 5,
          reps: '5',
          load: null,
          loadUnit: 'LB' as const,
          tracksLoad: true,
          tempo: null,
          distance: null,
          distanceUnit: null,
          calories: null,
          seconds: null,
        },
      ],
    }
    const strengthResult = {
      ...makeResult({ id: 'r-str', userId: 'somebody-else', name: 'Jane Doe' }),
      value: {
        movementResults: [
          {
            workoutMovementId: 'm-back-squat',
            loadUnit: 'LB',
            sets: [
              { reps: '5', load: 225 },
              { reps: '5', load: 235 },
              { reps: '5', load: 245 },
              { reps: '3', load: 255 },
              { reps: '1', load: 275 },
            ],
          },
        ],
      },
    }
    vi.mocked(api.workouts.get).mockResolvedValue(strengthWorkout)
    vi.mocked(api.results.leaderboard).mockResolvedValue([strengthResult] as never)

    renderPage('workout-1', 'r-str')

    // Movement section header is shown (also appears in the workout movement
    // chip list above, so allow the duplicate).
    const squatLabels = await screen.findAllByText('Back Squat')
    expect(squatLabels.length).toBeGreaterThanOrEqual(1)
    // Every set is enumerated, not just the heaviest
    expect(screen.getByText('Set 1')).toBeInTheDocument()
    expect(screen.getByText('Set 5')).toBeInTheDocument()
    // Each set's reps × load is rendered (the lighter sets would be hidden if
    // the page kept using the leaderboard summary helper).
    expect(screen.getByText('5 × 225 lb')).toBeInTheDocument()
    expect(screen.getByText('5 × 235 lb')).toBeInTheDocument()
    expect(screen.getByText('5 × 245 lb')).toBeInTheDocument()
    expect(screen.getByText('3 × 255 lb')).toBeInTheDocument()
    expect(screen.getByText('1 × 275 lb')).toBeInTheDocument()
    // Headline summary still surfaces the heaviest set
    expect(screen.getByText('1 x 275 lb')).toBeInTheDocument()
  })

  it('renders sets across multiple movements with the right names and per-movement units', async () => {
    const workout = {
      ...makeWorkout({
        title: 'Squat + Press',
        type: 'STRENGTH' as const,
        description: 'Heavy squat then press',
      }),
      workoutMovements: [
        {
          movement: { id: 'm-squat', name: 'Back Squat', parentId: null },
          displayOrder: 0,
          sets: 3,
          reps: '3',
          load: null,
          loadUnit: 'LB' as const,
          tracksLoad: true,
          tempo: null,
          distance: null,
          distanceUnit: null,
          calories: null,
          seconds: null,
        },
        {
          movement: { id: 'm-press', name: 'Strict Press', parentId: null },
          displayOrder: 1,
          sets: 3,
          reps: '5',
          load: null,
          loadUnit: 'KG' as const,
          tracksLoad: true,
          tempo: null,
          distance: null,
          distanceUnit: null,
          calories: null,
          seconds: null,
        },
      ],
    }
    const result = {
      ...makeResult({ id: 'r-multi', userId: 'somebody-else', name: 'Jane Doe', notes: 'Felt grindy on the third squat set.' }),
      value: {
        movementResults: [
          {
            workoutMovementId: 'm-squat',
            loadUnit: 'LB',
            sets: [
              { reps: '3', load: 285 },
              { reps: '3', load: 295 },
              { reps: '3', load: 305 },
            ],
          },
          {
            workoutMovementId: 'm-press',
            loadUnit: 'KG',
            sets: [
              { reps: '5', load: 60 },
              { reps: '5', load: 62.5 },
            ],
          },
        ],
      },
    }
    vi.mocked(api.workouts.get).mockResolvedValue(workout)
    vi.mocked(api.results.leaderboard).mockResolvedValue([result] as never)

    renderPage('workout-1', 'r-multi')

    // Both movement names appear as section headers in the result block
    const squat = await screen.findAllByText('Back Squat')
    expect(squat.length).toBeGreaterThan(0)
    const press = await screen.findAllByText('Strict Press')
    expect(press.length).toBeGreaterThan(0)

    // Per-movement load unit is honored
    expect(screen.getByText('3 × 305 lb')).toBeInTheDocument()
    expect(screen.getByText('5 × 62.5 kg')).toBeInTheDocument()

    // Notes are still rendered alongside the breakdown
    expect(screen.getByText(/Felt grindy/)).toBeInTheDocument()
  })
})
