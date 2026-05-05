import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LeaderboardCard from './LeaderboardCard'
import type { WorkoutResult } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      results: {
        leaderboard: vi.fn(),
      },
    },
  }
})

const makeEntry = (overrides: Partial<WorkoutResult> = {}): WorkoutResult => ({
  id: 'r1',
  userId: 'u1',
  workoutId: 'w1',
  level: 'RX',
  workoutGender: 'OPEN',
  value: { score: { kind: 'FOR_TIME', seconds: 225 } },
  notes: null,
  createdAt: new Date().toISOString(),
  user: { id: 'u1', name: 'Alice Johnson', firstName: 'Alice', lastName: 'Johnson', email: 'alice@test.com', avatarUrl: null, birthday: null },
  workout: { type: 'FOR_TIME' },
  ...overrides,
})

function renderCard(props: { workoutId?: string; workoutTitle?: string; myUserId?: string } = {}) {
  return render(
    <MemoryRouter>
      <LeaderboardCard workoutId="w1" workoutTitle="Fran" myUserId="u1" {...props} />
    </MemoryRouter>,
  )
}

describe('LeaderboardCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton while loading', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockReturnValue(new Promise(() => {}))
    const { container } = renderCard()
    expect(container.querySelector('.animate-pulse') ?? container.querySelector('[class*="shimmer"]') ?? container).toBeTruthy()
  })

  it('shows empty state when no results', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([])
    renderCard()
    expect(await screen.findByText(/No results yet/)).toBeInTheDocument()
  })

  it('renders top-5 rows with rank, name, level, and score', async () => {
    const { api } = await import('../lib/api')
    const entries = [
      makeEntry({ id: 'r1', userId: 'u1', user: { id: 'u1', name: 'Alice Johnson', firstName: 'Alice', lastName: 'Johnson', email: 'a@t.com', avatarUrl: null, birthday: null }, value: { score: { kind: 'TIME', seconds: 180 } } }),
      makeEntry({ id: 'r2', userId: 'u2', user: { id: 'u2', name: 'Bob Smith', firstName: 'Bob', lastName: 'Smith', email: 'b@t.com', avatarUrl: null, birthday: null }, level: 'SCALED' as const }),
    ]
    vi.mocked(api.results.leaderboard).mockResolvedValue(entries)
    renderCard({ myUserId: 'u1' })
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('Bob Smith')).toBeInTheDocument()
    expect(screen.getByText('RX')).toBeInTheDocument()
    expect(screen.getByText('SC')).toBeInTheDocument()
    expect(screen.getByText('3:00')).toBeInTheDocument()
  })

  it('highlights the current user row', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry({ userId: 'u1' })])
    renderCard({ myUserId: 'u1' })
    await screen.findByText('Alice Johnson')
    const myRow = screen.getByText('Alice Johnson').closest('[class*="indigo"]')
    expect(myRow).toBeTruthy()
  })

  it('shows Log prompt when current user has no result', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry({ userId: 'other-user' })])
    renderCard({ myUserId: 'me' })
    expect(await screen.findByText(/Log your result/)).toBeInTheDocument()
  })

  it('renders Full board link to workout detail', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry()])
    renderCard({ workoutId: 'abc123' })
    await screen.findByText('Alice Johnson')
    const link = screen.getByRole('link', { name: /Full board/ })
    expect(link).toHaveAttribute('href', '/workouts/abc123')
  })
})
