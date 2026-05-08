import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HotTodayCard from './HotTodayCard'
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

const makeEntry = (
  id: string,
  reactions: number,
  comments: number,
  overrides: Partial<WorkoutResult> = {},
): WorkoutResult => ({
  id,
  userId: id,
  workoutId: 'w1',
  level: 'RX',
  workoutGender: 'OPEN',
  value: { score: { kind: 'TIME', seconds: 300 } },
  notes: null,
  createdAt: new Date().toISOString(),
  user: { id, name: `User ${id}`, firstName: `User`, lastName: id, email: `${id}@test.com`, avatarUrl: null, birthday: null },
  workout: { type: 'FOR_TIME' },
  _count: { reactions, comments },
  ...overrides,
})

function renderCard(workoutId = 'w1') {
  return render(
    <MemoryRouter>
      <HotTodayCard workoutId={workoutId} />
    </MemoryRouter>,
  )
}

describe('HotTodayCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton while loading', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockReturnValue(new Promise(() => {}))
    const { container } = renderCard()
    expect(container.querySelector('.animate-pulse') ?? container.querySelector('[class*="shimmer"]') ?? container).toBeTruthy()
  })

  it('shows empty state when no results have any social activity', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeEntry('u1', 0, 0),
      makeEntry('u2', 0, 0),
    ])
    renderCard()
    expect(await screen.findByText(/No reactions yet/)).toBeInTheDocument()
  })

  it('renders top 3 by hot score (reactions + comments × 2)', async () => {
    const { api } = await import('../lib/api')
    // hotScore: u1=4+0=4, u2=1+4=5, u3=10+0=10, u4=0+2=4
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeEntry('u1', 4, 0),
      makeEntry('u2', 1, 2),
      makeEntry('u3', 10, 0),
      makeEntry('u4', 0, 1),
    ])
    renderCard()
    const rows = await screen.findAllByRole('button')
    // top 3 by score: u3(10), u2(5), u1(4) — u4 excluded
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('u3')
    expect(rows[1]).toHaveTextContent('u2')
    expect(rows[2]).toHaveTextContent('u1')
  })

  it('breaks hot-score ties by reaction count descending', async () => {
    const { api } = await import('../lib/api')
    // u1 and u2 both score 4, but u1 has more reactions
    vi.mocked(api.results.leaderboard).mockResolvedValue([
      makeEntry('u1', 4, 0),
      makeEntry('u2', 2, 1),
    ])
    renderCard()
    const rows = await screen.findAllByRole('button')
    expect(rows[0]).toHaveTextContent('u1')
    expect(rows[1]).toHaveTextContent('u2')
  })

  it('shows reaction and comment counts on each row', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry('u1', 5, 3)])
    renderCard()
    await screen.findByRole('link')
    expect(screen.getByLabelText('5 reactions')).toBeInTheDocument()
    expect(screen.getByLabelText('3 comments')).toBeInTheDocument()
  })

  it('avatar link navigates to the user profile page', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry('u1', 3, 1)])
    renderCard('abc123')
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', '/users/u1')
  })

  it('each row is a button that can be activated via keyboard', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry('u1', 3, 1)])
    renderCard('abc123')
    const row = await screen.findByRole('button')
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('renders the card header with Hot Today label', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.results.leaderboard).mockResolvedValue([makeEntry('u1', 2, 0)])
    renderCard()
    await screen.findByRole('button')
    expect(screen.getByText(/Hot Today/i)).toBeInTheDocument()
  })
})
