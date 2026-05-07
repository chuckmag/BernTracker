import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UpcomingCard from './UpcomingCard'
import type { Workout } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      workouts: {
        ...actual.api.workouts,
        list: vi.fn(),
      },
    },
  }
})

function scheduledAt(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

const makeWorkout = (daysFromNow: number, overrides: Partial<Workout> = {}): Workout => ({
  id: `w${daysFromNow}`,
  title: `Workout +${daysFromNow}d`,
  description: '',
  coachNotes: null,
  type: 'FOR_TIME',
  status: 'PUBLISHED',
  scheduledAt: scheduledAt(daysFromNow),
  dayOrder: 0,
  programId: null,
  program: null,
  namedWorkoutId: null,
  namedWorkout: null,
  workoutMovements: [],
  timeCapSeconds: null,
  tracksRounds: false,
  _count: { results: 0 },
  externalSourceId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

function renderCard() {
  return render(
    <MemoryRouter>
      <UpcomingCard gymId="gym-1" />
    </MemoryRouter>,
  )
}

describe('UpcomingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no upcoming workouts', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.workouts.list).mockResolvedValue([])
    renderCard()
    expect(await screen.findByText(/Nothing scheduled/)).toBeInTheDocument()
  })

  it('renders upcoming workout rows', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.workouts.list).mockResolvedValue([
      makeWorkout(1),
      makeWorkout(2),
    ])
    renderCard()
    expect(await screen.findByText('Workout +1d')).toBeInTheDocument()
    expect(screen.getByText('Workout +2d')).toBeInTheDocument()
  })

  it('labels the first day TOMORROW', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.workouts.list).mockResolvedValue([makeWorkout(1)])
    renderCard()
    expect(await screen.findByText('TOMORROW')).toBeInTheDocument()
  })

  it('caps at 4 days even when more are returned', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.workouts.list).mockResolvedValue([1, 2, 3, 4, 5].map((d) => makeWorkout(d)))
    renderCard()
    await screen.findByText('Workout +1d')
    const rows = screen.getAllByRole('button')
    expect(rows.length).toBe(4)
  })

  it('filters out DRAFT workouts', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.workouts.list).mockResolvedValue([
      makeWorkout(1, { status: 'DRAFT' }),
      makeWorkout(2),
    ])
    renderCard()
    await screen.findByText('Workout +2d')
    expect(screen.queryByText('Workout +1d')).not.toBeInTheDocument()
  })
})
