import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import WorkoutDrawer from './WorkoutDrawer'

vi.mock('../lib/api', () => ({
  api: {
    namedWorkouts: { list: vi.fn() },
    movements: { list: vi.fn(), detect: vi.fn() },
    gyms: { programs: { list: vi.fn() } },
    workouts: {
      create: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      delete: vi.fn(),
    },
  },
  TYPE_ABBR: {
    STRENGTH: 'S', FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C',
    AMRAP: 'A', METCON: 'M', WARMUP: 'W',
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [],
}))

import { api } from '../lib/api'

const noop = () => {}

function defaultProps(overrides: Partial<Parameters<typeof WorkoutDrawer>[0]> = {}) {
  return {
    gymId: 'gym-1',
    dateKey: '2026-04-21',
    workout: undefined,
    workoutsOnDay: [],
    userGymRole: 'OWNER' as const,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onAutoSaved: vi.fn(),
    onWorkoutSelect: noop,
    onNewWorkout: noop,
    ...overrides,
  }
}

function seedApi() {
  vi.mocked(api.namedWorkouts.list).mockResolvedValue([])
  vi.mocked(api.movements.list).mockResolvedValue([])
  vi.mocked(api.movements.detect).mockResolvedValue([])
  vi.mocked(api.gyms.programs.list).mockResolvedValue([
    { programId: 'prog-1', program: { id: 'prog-1', name: 'General' } } as never,
  ])
}

describe('WorkoutDrawer autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    seedApi()
  })

  it('does not autosave when drawer just opens with empty state', async () => {
    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)
    // Let programs load
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(api.workouts.create).not.toHaveBeenCalled()
  })

  it('autosaves a new workout as a draft after the debounce window', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(api.workouts.create).mockResolvedValue({
      id: 'new-wod-1',
      status: 'DRAFT',
    } as never)

    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)

    // Wait for programs to load and default programId to be set
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('e.g. Fran'), 'My Workout')
    await user.type(screen.getByPlaceholderText(/Workout details/), 'Do the thing')

    // Advance past the 2s debounce
    await act(async () => { vi.advanceTimersByTime(2100) })

    await waitFor(() => expect(api.workouts.create).toHaveBeenCalledTimes(1))
    const [gymIdArg, payload] = vi.mocked(api.workouts.create).mock.calls[0]
    expect(gymIdArg).toBe('gym-1')
    expect(payload).toMatchObject({
      programId: 'prog-1',
      title: 'My Workout',
      description: 'Do the thing',
      type: 'AMRAP',
    })
    expect(props.onAutoSaved).toHaveBeenCalled()
  })

  it('does not autosave a published workout', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const published = {
      id: 'wod-published',
      title: 'Published WOD',
      description: 'Already live',
      type: 'AMRAP' as const,
      status: 'PUBLISHED' as const,
      scheduledAt: '2026-04-21T12:00:00.000Z',
      dayOrder: 0,
      workoutMovements: [],
      programId: 'prog-1',
      program: { id: 'prog-1', name: 'General' },
      namedWorkoutId: null,
      namedWorkout: null,
    }
    const props = defaultProps({ workout: published as never })
    render(<WorkoutDrawer {...props} />)

    const title = screen.getByDisplayValue('Published WOD')
    await user.clear(title)
    await user.type(title, 'Edited title')

    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(api.workouts.update).not.toHaveBeenCalled()
    expect(api.workouts.create).not.toHaveBeenCalled()
  })

  it('flushes a pending autosave when the close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    vi.mocked(api.workouts.create).mockResolvedValue({
      id: 'new-wod-2',
      status: 'DRAFT',
    } as never)

    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('e.g. Fran'), 'Rapid Exit')
    await user.type(screen.getByPlaceholderText(/Workout details/), 'Emergency close')

    // Close immediately, before the 2s debounce fires
    await user.click(screen.getByLabelText('Close drawer'))

    await waitFor(() => expect(api.workouts.create).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.workouts.create).mock.calls[0][1]).toMatchObject({
      title: 'Rapid Exit',
      description: 'Emergency close',
    })
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('WorkoutDrawer markdown paste', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedApi()
  })

  it('converts pasted HTML into markdown in the description', async () => {
    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)

    const textarea = screen.getByPlaceholderText(/Workout details/) as HTMLTextAreaElement
    textarea.focus()

    const html =
      '<table><thead><tr><th>Round</th><th>Reps</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>21</td></tr><tr><td>2</td><td>15</td></tr></tbody></table>'

    // jsdom lacks DataTransfer, so shim a minimal clipboardData for fireEvent.paste
    const clipboardData = {
      getData: (type: string) => (type === 'text/html' ? html : ''),
    }

    await act(async () => {
      fireEvent.paste(textarea, { clipboardData })
    })

    await waitFor(() => {
      expect(textarea.value).toContain('| Round | Reps |')
      expect(textarea.value).toContain('| 1 | 21 |')
    })
  })
})
