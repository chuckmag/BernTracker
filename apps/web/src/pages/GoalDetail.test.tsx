import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GoalDetail from './GoalDetail'
import type { GoalResponse } from '../lib/api'

// recharts renders inside an SVG that's hard to assert on in jsdom.
// Stub the components we care about so the test can check that
// `ReferenceLine` is rendered with the correct y value and label —
// the visual rendering is covered by the live dev stack + E2E.
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  CartesianGrid: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ReferenceLine: ({ y, label }: { y: number; label: { value: string } }) => (
    <div data-testid="reference-line" data-y={y}>{label?.value}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ name }: { name: string }) => <div data-testid="bar">{name}</div>,
  Legend: () => <div data-testid="legend" />,
}))

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light' }),
}))

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      goals: {
        get: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      me: {
        ...actual.api.me,
        analytics: {
          ...actual.api.me.analytics,
          movementTrajectory: vi.fn(),
        },
      },
    },
  }
})

function makeGoal(over: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'g1',
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
      percent: 93,
      isComplete: false,
    },
    ...over,
  }
}

function renderDetail(id = 'g1') {
  return render(
    <MemoryRouter initialEntries={[`/goals/${id}`]}>
      <Routes>
        <Route path="/goals/:id" element={<GoalDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GoalDetail', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders a 404 message when API returns 404', async () => {
    const { api } = await import('../lib/api')
    const err = Object.assign(new Error('Goal not found'), { status: 404 })
    vi.mocked(api.goals.get).mockRejectedValue(err)
    renderDetail()
    expect(await screen.findByText(/Goal not found/i)).toBeInTheDocument()
  })

  it('renders a 403 message when API returns 403', async () => {
    const { api } = await import('../lib/api')
    const err = Object.assign(new Error('forbidden'), { status: 403 })
    vi.mocked(api.goals.get).mockRejectedValue(err)
    renderDetail()
    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument()
  })

  it('renders the goal header for a PR Target goal', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.goals.get).mockResolvedValue(makeGoal())
    vi.mocked(api.me.analytics.movementTrajectory).mockResolvedValue({
      prType: 'LOAD',
      points: [
        { achievedAt: '2026-01-01T00:00:00.000Z', value: 250, label: '250 lb' },
        { achievedAt: '2026-02-01T00:00:00.000Z', value: 275, label: '275 lb' },
        { achievedAt: '2026-03-01T00:00:00.000Z', value: 295, label: '295 lb' },
      ],
    })
    renderDetail()
    expect(await screen.findByRole('heading', { name: 'Hit 315 back squat' })).toBeInTheDocument()
    expect(screen.getByText(/PR Target/i)).toBeInTheDocument()
  })

  it('renders a ReferenceLine at the goal target value (label "Goal: 315 lb")', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.goals.get).mockResolvedValue(makeGoal())
    vi.mocked(api.me.analytics.movementTrajectory).mockResolvedValue({
      prType: 'LOAD',
      points: [
        { achievedAt: '2026-01-01T00:00:00.000Z', value: 250, label: '250 lb' },
        { achievedAt: '2026-02-01T00:00:00.000Z', value: 275, label: '275 lb' },
      ],
    })
    renderDetail()
    const ref = await screen.findByTestId('reference-line')
    expect(ref).toHaveAttribute('data-y', '315')
    expect(ref).toHaveTextContent('Goal: 315 lb')
  })

  it('renders the Habit body with a "Mark complete" button and v2 placeholder', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.goals.get).mockResolvedValue(
      makeGoal({
        type: 'HABIT',
        title: 'Sign up for the Open',
        targetPrType: null,
        targetValue: null,
        targetLoadUnit: null,
        targetRepCount: 1,
        movementId: null,
        movement: null,
        progress: { type: 'HABIT' },
      }),
    )
    renderDetail()
    expect(await screen.findByRole('button', { name: /Mark complete/i })).toBeInTheDocument()
    expect(screen.getByText(/Daily check-ins coming soon/i)).toBeInTheDocument()
  })

  it('renders the Frequency body with a bar chart and Logged/Required series', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.goals.get).mockResolvedValue(
      makeGoal({
        type: 'FREQUENCY',
        title: '4 workouts/wk for a month',
        targetPrType: null,
        targetValue: null,
        targetLoadUnit: null,
        targetRepCount: null,
        movementId: null,
        movement: null,
        frequencyPerWeek: 4,
        frequencyWeeks: 4,
        progress: {
          type: 'FREQUENCY',
          workoutsLogged: 5,
          workoutsRequired: 16,
          percent: 31,
          weeksRemaining: 3,
          currentWeekCount: 1,
          isComplete: false,
        },
      }),
    )
    renderDetail()
    expect(await screen.findByText(/Weekly progress/i)).toBeInTheDocument()
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    const bars = screen.getAllByTestId('bar')
    expect(bars.map((b) => b.textContent)).toEqual(expect.arrayContaining(['Logged', 'Required']))
  })
})
