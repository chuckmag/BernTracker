import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WorkoutMovementHistory from './WorkoutMovementHistory'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({
  api: {
    movements: {
      myHistory: vi.fn(),
    },
    me: {
      personalProgram: {
        workouts: {
          create: vi.fn(),
        },
      },
    },
    results: {
      create: vi.fn(),
    },
  },
}))

const strengthHistoryResponse = {
  movementId: 'mv-1',
  movementName: 'Back Squat',
  category: 'STRENGTH' as const,
  prTable: {
    category: 'STRENGTH' as const,
    entries: [
      { reps: 5, maxLoad: 225, unit: 'LB', workoutId: 'w-1', resultId: 'r-1', workoutScheduledAt: '2026-04-01T00:00:00Z' },
    ],
  },
  results: [],
  total: 0,
  page: 1,
  limit: 10,
  pages: 0,
}

function renderComponent() {
  return render(
    <MemoryRouter>
      <WorkoutMovementHistory movementId="mv-1" movementName="Back Squat" currentWorkoutId="w-cur" />
    </MemoryRouter>,
  )
}

describe('WorkoutMovementHistory', () => {
  beforeEach(() => {
    vi.mocked(api.movements.myHistory).mockResolvedValue(strengthHistoryResponse as Parameters<typeof api.movements.myHistory>[0] extends string ? never : Awaited<ReturnType<typeof api.movements.myHistory>>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the movement history section without crashing', async () => {
    renderComponent()
    await screen.findByText('Back Squat — Your History')
  })

  it('shows a filled cell for a tested RM and ??? buttons for untested slots', async () => {
    renderComponent()
    // 5RM is tested (225 lb) — rendered as a clickable button linking to the workout
    const filledCell = await screen.findByTitle('View your 5RM — 225 LB')
    expect(filledCell.tagName).toBe('BUTTON')
    expect(screen.getByText('225')).toBeInTheDocument()

    // All other 1–10RM slots are untested — rendered as dashed buttons
    const emptySlots = screen.getAllByTitle(/^Log your \d+RM$/)
    expect(emptySlots).toHaveLength(9) // 1,2,3,4,6,7,8,9,10
    emptySlots.forEach((btn) => expect(btn.tagName).toBe('BUTTON'))
  })

  it('clicking a filled RM cell navigates to the workout without opening the modal', async () => {
    renderComponent()
    const filledCell = await screen.findByTitle('View your 5RM — 225 LB')
    fireEvent.click(filledCell)
    // Modal should NOT open — clicking a filled slot navigates, doesn't backfill
    expect(screen.queryByText('5RM — Back Squat')).not.toBeInTheDocument()
  })

  it('clicking a ??? button opens the backfill modal with the correct heading', async () => {
    renderComponent()
    const btn = await screen.findByTitle('Log your 1RM')
    fireEvent.click(btn)
    await screen.findByText('1RM — Back Squat')
    expect(screen.getByText('Log your max effort for this rep count')).toBeInTheDocument()
  })

  it('Cancel button closes the modal without calling any API', async () => {
    renderComponent()
    fireEvent.click(await screen.findByTitle('Log your 3RM'))
    await screen.findByText('3RM — Back Squat')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('3RM — Back Squat')).not.toBeInTheDocument())

    expect(api.me.personalProgram.workouts.create).not.toHaveBeenCalled()
    expect(api.results.create).not.toHaveBeenCalled()
  })

  it('shows validation error when Save is clicked with no load entered', async () => {
    renderComponent()
    fireEvent.click(await screen.findByTitle('Log your 1RM'))
    await screen.findByText('1RM — Back Squat')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toMatch(/valid load/i)
    expect(api.me.personalProgram.workouts.create).not.toHaveBeenCalled()
  })

  it('Save creates a personal-program workout then logs the result and refreshes', async () => {
    vi.mocked(api.me.personalProgram.workouts.create).mockResolvedValue({ id: 'w-new' } as Awaited<ReturnType<typeof api.me.personalProgram.workouts.create>>)
    vi.mocked(api.results.create).mockResolvedValue(undefined as Awaited<ReturnType<typeof api.results.create>>)
    // Second myHistory call (after save) returns updated data with 1RM filled
    vi.mocked(api.movements.myHistory)
      .mockResolvedValueOnce(strengthHistoryResponse as Awaited<ReturnType<typeof api.movements.myHistory>>)
      .mockResolvedValue({
        ...strengthHistoryResponse,
        prTable: {
          category: 'STRENGTH',
          entries: [
            ...strengthHistoryResponse.prTable.entries,
            { reps: 1, maxLoad: 315, unit: 'LB', workoutId: 'w-new', resultId: 'r-new', workoutScheduledAt: '2026-05-05T12:00:00Z' },
          ],
        },
      } as Awaited<ReturnType<typeof api.movements.myHistory>>)

    renderComponent()
    fireEvent.click(await screen.findByTitle('Log your 1RM'))
    await screen.findByText('1RM — Back Squat')

    fireEvent.change(screen.getByLabelText('Load (lb)'), { target: { value: '315' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.me.personalProgram.workouts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Back Squat 1RM',
        description: '1 × 315 lb',
        type: 'STRENGTH',
        movementIds: ['mv-1'],
      }),
    ))
    expect(api.results.create).toHaveBeenCalledWith('w-new', expect.objectContaining({
      level: 'RX',
      workoutGender: 'OPEN',
      value: expect.objectContaining({
        movementResults: [expect.objectContaining({ workoutMovementId: 'mv-1', sets: [{ reps: '1', load: 315 }] })],
      }),
    }))

    // Modal closes and data refreshes (second myHistory call)
    await waitFor(() => expect(screen.queryByText('1RM — Back Squat')).not.toBeInTheDocument())
    await waitFor(() => expect(api.movements.myHistory).toHaveBeenCalledTimes(2))
  })
})
