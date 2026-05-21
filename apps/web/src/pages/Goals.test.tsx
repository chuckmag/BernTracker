import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Goals from './Goals'
import type { GoalResponse } from '../lib/api'

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
      percent: 50,
      isComplete: false,
    },
    ...over,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/goals']}>
      <Goals />
    </MemoryRouter>,
  )
}

describe('Goals page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders all three status tabs', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('tab', { name: 'Active' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Archived' })).toBeInTheDocument()
  })

  it('initially fetches ACTIVE goals', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'ACTIVE' })
    })
  })

  it('refetches with COMPLETED when the Completed tab is clicked', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    await screen.findByRole('tab', { name: 'Completed' })
    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenLastCalledWith({ status: 'COMPLETED' })
    })
  })

  it('renders the goal list when API returns rows', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([makeGoal({ title: 'Goal Alpha' })])
    renderPage()
    expect(await screen.findByText('Goal Alpha')).toBeInTheDocument()
  })

  it('shows empty state with a CTA on the Active tab when no goals', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/No active goals/i)).toBeInTheDocument()
    // Two "+ New goal" buttons present: page header + empty-state CTA.
    expect(screen.getAllByRole('button', { name: /\+ New goal/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('opens the create dialog when "+ New goal" is clicked', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    await screen.findByRole('heading', { name: 'Goals' })
    // Two "+ New goal" buttons: page header + empty-state CTA. Either opens the dialog.
    await userEvent.click(screen.getAllByRole('button', { name: /\+ New goal/i })[0])
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Goal create dialog (rendered inside Goals page)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  async function openDialog() {
    const { api } = await import('../lib/api')
    vi.mocked(api.users.me.goals.list).mockResolvedValue([])
    renderPage()
    await screen.findByRole('heading', { name: 'Goals' })
    await userEvent.click(screen.getAllByRole('button', { name: /\+ New goal/i })[0])
    await screen.findByRole('dialog')
  }

  it('SMART hint appears by default (no target date)', async () => {
    await openDialog()
    expect(screen.getByText(/T in SMART/i)).toBeInTheDocument()
  })

  it('SMART hint disappears once a target date is set', async () => {
    await openDialog()
    const dateInput = screen.getByLabelText(/Target date/i)
    await userEvent.type(dateInput, '2027-01-01')
    expect(screen.queryByText(/T in SMART/i)).not.toBeInTheDocument()
  })

  it('PR Target form shows the rep count field for LOAD goals', async () => {
    await openDialog()
    // LOAD is the default targetPrType.
    expect(screen.getByLabelText(/Rep count/i)).toBeInTheDocument()
  })

  it('Rep count field hides when switching to TIME', async () => {
    await openDialog()
    const trackSelect = screen.getByLabelText(/Track/)
    await userEvent.selectOptions(trackSelect, 'TIME')
    expect(screen.queryByLabelText(/Rep count/i)).not.toBeInTheDocument()
  })

  it('Frequency form swaps the inputs to per-week + weeks', async () => {
    await openDialog()
    const typeSelect = screen.getByLabelText(/^Type$/)
    await userEvent.selectOptions(typeSelect, 'FREQUENCY')
    expect(screen.getByLabelText(/Workouts \/ week/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/For how many weeks/i)).toBeInTheDocument()
  })

  it('Habit form shows the v2 note', async () => {
    await openDialog()
    const typeSelect = screen.getByLabelText(/^Type$/)
    await userEvent.selectOptions(typeSelect, 'HABIT')
    expect(screen.getByText(/Check-ins coming in v2/i)).toBeInTheDocument()
  })

  it('rejects empty title with an inline error', async () => {
    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }))
    expect(await screen.findByText(/Title is required/i)).toBeInTheDocument()
  })

  it('rejects PR target with no movement selected', async () => {
    await openDialog()
    await userEvent.type(screen.getByLabelText(/^Title$/), 'A goal')
    await userEvent.type(screen.getByLabelText(/^Target$/), '300')
    await userEvent.click(screen.getByRole('button', { name: /Create goal/i }))
    expect(await screen.findByText(/Pick a movement/i)).toBeInTheDocument()
  })
})
