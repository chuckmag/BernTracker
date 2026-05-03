import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WodDetail from './WodDetail'

// Renders the current pathname so navigation assertions can read it.
function RouteSpy() {
  const loc = useLocation()
  return <div data-testid="current-route">{loc.pathname}</div>
}

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
    timeCapSeconds: null,
    tracksRounds: false,
    _count: { results: 0 },
    externalSourceId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage(workoutId = 'workout-1') {
  return render(
    <MemoryRouter initialEntries={[`/workouts/${workoutId}`]}>
      <RouteSpy />
      <Routes>
        <Route path="/workouts/:id" element={<WodDetail />} />
        <Route path="/workouts/:id/results/:resultId" element={<div>result detail stub</div>} />
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

function makeResult(overrides: { id: string; userId: string; name: string; level: 'RX_PLUS' | 'RX' | 'SCALED' | 'MODIFIED'; seconds: number; avatarUrl?: string | null }) {
  const [first, ...rest] = overrides.name.split(' ')
  return {
    id: overrides.id,
    userId: overrides.userId,
    user: {
      id: overrides.userId,
      name: overrides.name,
      firstName: first ?? null,
      lastName: rest.join(' ') || null,
      email: `${overrides.userId}@test.com`,
      avatarUrl: overrides.avatarUrl ?? null,
    },
    level: overrides.level,
    workoutGender: 'OPEN' as const,
    value: { score: { kind: 'TIME', seconds: overrides.seconds, cappedOut: false }, movementResults: [] },
    notes: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    workout: { id: 'workout-1', type: 'FOR_TIME' as const, scheduledAt: '2026-07-15T12:00:00.000Z', title: 'Test Workout' },
  }
}

// API delivers in non-sorted order on purpose so the level-desc sort is exercised.
const MIXED_LEADERBOARD = [
  makeResult({ id: 'r-2', userId: 'u-2', name: 'Rx User',       level: 'RX',       seconds: 305 }),
  makeResult({ id: 'r-4', userId: 'u-4', name: 'Modified User', level: 'MODIFIED', seconds: 360 }),
  makeResult({ id: 'r-1', userId: 'u-1', name: 'RxPlus User',   level: 'RX_PLUS',  seconds: 290 }),
  makeResult({ id: 'r-3', userId: 'u-3', name: 'Scaled User',   level: 'SCALED',   seconds: 330 }),
]

// Returns the body-row athlete names in DOM order so assertions can verify sort.
function visibleAthleteOrder(): string[] {
  const cells = Array.from(document.querySelectorAll('tbody tr td:nth-child(2)'))
  return cells
    .map((td) => {
      // Strip the avatar fallback (an aria-hidden initials div) so its
      // text doesn't pollute the cell's textContent.
      const clone = td.cloneNode(true) as HTMLElement
      clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove())
      return clone.textContent ?? ''
    })
    // Strip the "(you)" suffix added next to the viewer's row.
    .map((s) => s.replace(/\s*\(you\)\s*$/, '').trim())
    .filter((s) => s.length > 0)
}

describe('WodDetail level filter — graded inclusion + ordering', () => {
  beforeEach(() => {
    vi.mocked(api.workouts.get).mockResolvedValue(makeWorkout())
    vi.mocked(api.results.leaderboard).mockResolvedValue(MIXED_LEADERBOARD as never)
  })

  it('defaults to RX when the viewer has no logged result, showing RX + Scaled + Modified ordered by level desc', async () => {
    renderPage()
    await screen.findByText('Rx User')

    // RX+ excluded, the other three included.
    expect(screen.queryByText('RxPlus User')).not.toBeInTheDocument()
    expect(screen.getByText('Rx User')).toBeInTheDocument()
    expect(screen.getByText('Scaled User')).toBeInTheDocument()
    expect(screen.getByText('Modified User')).toBeInTheDocument()

    // Order: RX → Scaled → Modified (harder first).
    expect(visibleAthleteOrder()).toEqual(['Rx User', 'Scaled User', 'Modified User'])
  })

  it('clicking the Scaled segment shows Scaled + Modified only', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rx User')

    await user.click(screen.getByRole('radio', { name: 'Scaled' }))

    await screen.findByText('Scaled User')
    expect(screen.queryByText('RxPlus User')).not.toBeInTheDocument()
    expect(screen.queryByText('Rx User')).not.toBeInTheDocument()
    expect(screen.getByText('Modified User')).toBeInTheDocument()

    expect(visibleAthleteOrder()).toEqual(['Scaled User', 'Modified User'])
  })

  it('toggling "Show all levels" reveals every result ordered RX+ → RX → Scaled → Modified and disables the segments', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Rx User')

    await user.click(screen.getByRole('checkbox', { name: /show all levels/i }))

    expect(await screen.findByText('RxPlus User')).toBeInTheDocument()
    expect(visibleAthleteOrder()).toEqual([
      'RxPlus User', 'Rx User', 'Scaled User', 'Modified User',
    ])

    for (const label of ['RX+', 'RX', 'Scaled', 'Modified']) {
      expect(screen.getByRole('radio', { name: label })).toBeDisabled()
    }
  })

  it('renders an avatar next to each athlete and navigates to the result detail when a row is clicked', async () => {
    const userEv = userEvent.setup()
    renderPage()
    await screen.findByText('Rx User')

    // Each visible row exposes a "View …'s result" button label, so the avatar
    // + name area is reachable by keyboard and the row is clickable.
    const buttons = screen.getAllByRole('button', { name: /View .+ result/i })
    expect(buttons.length).toBeGreaterThan(0)

    // Avatar fallback for "Rx User" → initials "RU" rendered in the cell.
    expect(screen.getByText('RU')).toBeInTheDocument()

    await userEv.click(screen.getByRole('button', { name: /View Rx User's result/i }))
    expect(await screen.findByTestId('current-route')).toHaveTextContent(
      '/workouts/workout-1/results/r-2',
    )
  })

  it("auto-selects the viewer's own logged level when the leaderboard contains it", async () => {
    // user-1 is the auth-mocked viewer; give them a Scaled result.
    const leaderboardWithViewer = [
      ...MIXED_LEADERBOARD,
      makeResult({ id: 'r-me', userId: 'user-1', name: 'Test User', level: 'SCALED', seconds: 340 }),
    ]
    vi.mocked(api.results.leaderboard).mockResolvedValue(leaderboardWithViewer as never)

    renderPage()
    // Wait for auto-detect to apply: the Scaled segment becomes pressed.
    await screen.findByText(/Test User/)

    await screen.findByRole('radio', { name: 'Scaled', checked: true })

    // RxPlus / Rx are hidden; Scaled (self + others) and Modified are shown.
    expect(screen.queryByText('RxPlus User')).not.toBeInTheDocument()
    expect(screen.queryByText('Rx User')).not.toBeInTheDocument()
    expect(screen.getByText('Scaled User')).toBeInTheDocument()
    expect(screen.getByText('Modified User')).toBeInTheDocument()
    expect(screen.getByText(/Test User/)).toBeInTheDocument()
  })
})
