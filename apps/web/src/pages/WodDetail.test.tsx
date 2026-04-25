import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WodDetail from './WodDetail'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    workouts: { get: vi.fn() },
    results: { leaderboard: vi.fn() },
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

  it('renders markdown tables in the description', async () => {
    const md = [
      '| Round | Reps |',
      '| --- | --- |',
      '| 1 | 21 |',
      '| 2 | 15 |',
    ].join('\n')
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout({ description: md }))
    renderPage()
    // Headers render as <th>
    expect(await screen.findByRole('columnheader', { name: 'Round' })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Reps' })).toBeInTheDocument()
    // Cells render as <td>
    expect(await screen.findByRole('cell', { name: '21' })).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: '15' })).toBeInTheDocument()
  })

  it('renders markdown bold and list formatting in the description', async () => {
    const md = '**Warm up** with:\n- Jumping jacks\n- Air squats'
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout({ description: md }))
    renderPage()
    const strong = await screen.findByText('Warm up')
    expect(strong.tagName).toBe('STRONG')
    expect(await screen.findByText('Jumping jacks')).toBeInTheDocument()
    expect(await screen.findByText('Air squats')).toBeInTheDocument()
  })
})

// ─── Level filter (segmented control + Show all) ─────────────────────────────

function makeResult(overrides: { id: string; userId: string; name: string; level: 'RX_PLUS' | 'RX' | 'SCALED' | 'MODIFIED'; seconds: number }) {
  return {
    id: overrides.id,
    userId: overrides.userId,
    user: { id: overrides.userId, name: overrides.name },
    level: overrides.level,
    workoutGender: 'OPEN' as const,
    value: { seconds: overrides.seconds, cappedOut: false },
    notes: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    workout: { id: 'workout-1', type: 'FOR_TIME' as const, scheduledAt: '2026-07-15T12:00:00.000Z', title: 'Test Workout' },
  }
}

const MIXED_LEADERBOARD = [
  makeResult({ id: 'r-1', userId: 'u-1', name: 'RxPlus User',  level: 'RX_PLUS',  seconds: 290 }),
  makeResult({ id: 'r-2', userId: 'u-2', name: 'Rx User',      level: 'RX',       seconds: 305 }),
  makeResult({ id: 'r-3', userId: 'u-3', name: 'Scaled User',  level: 'SCALED',   seconds: 330 }),
  makeResult({ id: 'r-4', userId: 'u-4', name: 'Modified User',level: 'MODIFIED', seconds: 360 }),
]

describe('WodDetail level filter', () => {
  beforeEach(() => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue(MIXED_LEADERBOARD as never)
  })

  it('shows only RX results by default', async () => {
    renderPage()
    expect(await screen.findByText('Rx User')).toBeInTheDocument()
    expect(screen.queryByText('RxPlus User')).not.toBeInTheDocument()
    expect(screen.queryByText('Scaled User')).not.toBeInTheDocument()
    expect(screen.queryByText('Modified User')).not.toBeInTheDocument()
  })

  it('filters to Scaled when the Scaled segment is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    // Wait for the page to mount + leaderboard to resolve.
    await screen.findByText('Rx User')

    await user.click(screen.getByRole('radio', { name: 'Scaled' }))

    expect(await screen.findByText('Scaled User')).toBeInTheDocument()
    expect(screen.queryByText('Rx User')).not.toBeInTheDocument()
    expect(screen.queryByText('RxPlus User')).not.toBeInTheDocument()
    expect(screen.queryByText('Modified User')).not.toBeInTheDocument()
  })

  it('toggling "Show all levels" reveals every result and disables the segments', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rx User')

    await user.click(screen.getByRole('checkbox', { name: /show all levels/i }))

    expect(await screen.findByText('RxPlus User')).toBeInTheDocument()
    expect(screen.getByText('Rx User')).toBeInTheDocument()
    expect(screen.getByText('Scaled User')).toBeInTheDocument()
    expect(screen.getByText('Modified User')).toBeInTheDocument()

    // Each segment is disabled while "Show all" is on.
    for (const label of ['RX+', 'RX', 'Scaled', 'Modified']) {
      expect(screen.getByRole('radio', { name: label })).toBeDisabled()
    }
  })
})
