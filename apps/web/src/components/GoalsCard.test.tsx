import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import GoalsCard from './GoalsCard'
import type { GoalResponse } from '../lib/api'

// MovementsContext is wired into GoalFormDialog via useMovements(). The
// dialog only fetches when opened; even so, mock the context to return an
// empty list so the test doesn't need to provide a real provider.
vi.mock('../context/MovementsContext', () => ({
  useMovements: () => [],
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      users: {
        ...actual.api.users,
        me: {
          ...actual.api.users.me,
          goals: {
            list: vi.fn(),
            create: vi.fn(),
          },
        },
      },
      namedWorkouts: {
        ...actual.api.namedWorkouts,
        list: vi.fn().mockResolvedValue([]),
      },
    },
  }
})

function makeGoal(over: Partial<GoalResponse> = {}): GoalResponse {
  const base: GoalResponse = {
    id: over.id ?? 'g1',
    userId: 'u1',
    type: 'PR_TARGET',
    status: 'ACTIVE',
    title: 'Hit 315 back squat',
    targetDate: null,
    movementId: 'mov1',
    namedWorkoutId: null,
    targetPrType: 'LOAD',
    targetValue: 315,
    targetLoadUnit: 'LB',
    targetDistanceUnit: null,
    targetRepCount: 1,
    frequencyPerWeek: null,
    frequencyWeeks: null,
    frequencyStartDate: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    movement: { id: 'mov1', name: 'Back Squat' },
    namedWorkout: null,
    progress: {
      type: 'PR_TARGET',
      current: 295,
      target: 315,
      unit: 'LB',
      percent: 50,
      isComplete: false,
    },
  }
  return { ...base, ...over }
}

function renderCard() {
  return render(
    <MemoryRouter>
      <GoalsCard />
    </MemoryRouter>,
  )
}

describe('GoalsCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders empty state with CTA when no active goals', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderCard()
    expect(await screen.findByText(/No active goals yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Set your first goal/i })).toBeInTheDocument()
  })

  it('renders a single goal row with title and progress label', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([makeGoal()])
    renderCard()
    expect(await screen.findByText('Hit 315 back squat')).toBeInTheDocument()
    expect(screen.getByText('295 / 315 lb')).toBeInTheDocument()
  })

  it('renders at most 3 goals even when the API returns more', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([
      makeGoal({ id: 'g1', title: 'Goal A' }),
      makeGoal({ id: 'g2', title: 'Goal B' }),
      makeGoal({ id: 'g3', title: 'Goal C' }),
      makeGoal({ id: 'g4', title: 'Goal D' }),
    ])
    renderCard()
    expect(await screen.findByText('Goal A')).toBeInTheDocument()
    expect(screen.getByText('Goal B')).toBeInTheDocument()
    expect(screen.getByText('Goal C')).toBeInTheDocument()
    expect(screen.queryByText('Goal D')).not.toBeInTheDocument()
  })

  it('queries the goals list with status=ACTIVE', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderCard()
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'ACTIVE' })
    })
  })

  it('"+ New goal" button opens the create dialog (renders dialog heading)', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([makeGoal()])
    renderCard()
    await screen.findByText('Hit 315 back squat')
    const newGoalBtn = screen.getByRole('button', { name: /\+ New goal/i })
    await userEvent.click(newGoalBtn)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New goal' })).toBeInTheDocument()
  })

  it('renders the View all link to /goals', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderCard()
    const link = await screen.findByRole('link', { name: /View all/i })
    expect(link).toHaveAttribute('href', '/goals')
  })

  it('renders a HABIT row with a streak label derived from currentStreak', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([
      makeGoal({
        id: 'gh',
        type: 'HABIT',
        title: 'Sign up for the Open',
        targetPrType: null,
        targetValue: null,
        targetLoadUnit: null,
        targetRepCount: null,
        movementId: null,
        movement: null,
        progress: {
          type: 'HABIT',
          currentStreak: 4,
          longestStreak: 4,
          totalCheckIns: 4,
          weekCheckIns: 4,
          last7Days: [],
          checkedInToday: true,
        },
      }),
    ])
    renderCard()
    expect(await screen.findByText('Sign up for the Open')).toBeInTheDocument()
    expect(screen.getByText(/4-day streak/i)).toBeInTheDocument()
  })

  it('renders a HABIT row with the start-a-streak prompt when streak=0', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([
      makeGoal({
        id: 'gh2',
        type: 'HABIT',
        title: 'Avoid sugar',
        targetPrType: null,
        targetValue: null,
        targetLoadUnit: null,
        targetRepCount: null,
        movementId: null,
        movement: null,
        progress: {
          type: 'HABIT',
          currentStreak: 0,
          longestStreak: 0,
          totalCheckIns: 0,
          weekCheckIns: 0,
          last7Days: [],
          checkedInToday: false,
        },
      }),
    ])
    renderCard()
    expect(await screen.findByText(/Tap to start a streak/i)).toBeInTheDocument()
  })
})
