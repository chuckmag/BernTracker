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

describe('WorkoutDrawer prescription editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedApi()
  })

  it('shows time-cap input for Metcon types and tracksRounds toggle only for AMRAP', async () => {
    const user = userEvent.setup()
    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument())

    // AMRAP is the default type — both inputs are visible
    expect(screen.getByLabelText(/Time cap/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Track rounds/)).toBeInTheDocument()

    // Switch to FOR_TIME — time cap stays, tracks-rounds disappears
    await user.selectOptions(screen.getByLabelText('Type'), 'FOR_TIME')
    expect(screen.getByLabelText(/Time cap/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Track rounds/)).not.toBeInTheDocument()

    // Switch to a Strength type — both disappear
    await user.selectOptions(screen.getByLabelText('Type'), 'POWER_LIFTING')
    expect(screen.queryByLabelText(/Time cap/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Track rounds/)).not.toBeInTheDocument()
  })

  it('renders Sets/Reps/Tempo defaults (no load) for a Strength workout movement', async () => {
    const props = defaultProps({
      workout: {
        id: 'wod-1', title: 'Back Squat 5x5', description: 'Heavy day',
        type: 'POWER_LIFTING' as const, status: 'DRAFT' as const,
        scheduledAt: '2026-04-21T12:00:00.000Z', dayOrder: 0,
        workoutMovements: [{
          movement: { id: 'mv-1', name: 'Back Squat', parentId: null },
          displayOrder: 0,
          sets: 5, reps: '5', load: null, loadUnit: null,
          tempo: '3.1.1.0', distance: null, distanceUnit: null,
          calories: null, seconds: null,
        }],
        programId: 'prog-1', program: { id: 'prog-1', name: 'General' },
        namedWorkoutId: null, namedWorkout: null,
        timeCapSeconds: null, tracksRounds: false,
      } as never,
    })
    render(<WorkoutDrawer {...props} />)

    await waitFor(() => expect(screen.getByText('Back Squat')).toBeInTheDocument())

    // Strength prescription surfaces sets/reps/tempo only — `load` is
    // intentionally omitted (slice 2B feedback: weights are too individual
    // to prescribe usefully). Distance/Cals/Seconds also hidden — barbell
    // work doesn't have those axes.
    expect((screen.getByLabelText('Sets') as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText('Reps') as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText('Tempo') as HTMLInputElement).value).toBe('3.1.1.0')
    expect(screen.queryByLabelText('Load')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Distance')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cals')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Seconds')).not.toBeInTheDocument()
  })

  it('Metcon prescription surfaces Load (Fran-style 95 lb thrusters) and saves it through', async () => {
    const user = userEvent.setup()
    vi.mocked(api.workouts.update).mockResolvedValue({} as never)

    const props = defaultProps({
      workout: {
        id: 'wod-1', title: 'Fran', description: '21-15-9',
        type: 'FOR_TIME' as const, status: 'DRAFT' as const,
        scheduledAt: '2026-04-21T12:00:00.000Z', dayOrder: 0,
        workoutMovements: [{
          movement: { id: 'mv-1', name: 'Thrusters', parentId: null },
          displayOrder: 0, sets: 3, reps: '21', load: 95, loadUnit: 'LB' as const,
          tempo: null, distance: null, distanceUnit: null, calories: null, seconds: null,
        }],
        programId: 'prog-1', program: { id: 'prog-1', name: 'General' },
        namedWorkoutId: null, namedWorkout: null,
        timeCapSeconds: null, tracksRounds: false,
      } as never,
    })
    render(<WorkoutDrawer {...props} />)
    await waitFor(() => expect(screen.getByText('Thrusters')).toBeInTheDocument())

    const loadInput = screen.getByLabelText('Load') as HTMLInputElement
    expect(loadInput.value).toBe('95')
    await user.clear(loadInput)
    await user.type(loadInput, '105')
    await user.click(screen.getByText('Save as Draft'))

    await waitFor(() => expect(api.workouts.update).toHaveBeenCalled())
    const [, payload] = vi.mocked(api.workouts.update).mock.calls[0]
    expect(payload).toMatchObject({
      movements: [{
        movementId: 'mv-1',
        displayOrder: 0,
        sets: 3,
        reps: '21',
        load: 105,
        loadUnit: 'LB',
      }],
    })
  })

  it('parses M:SS time-cap input and forwards tracksRounds for AMRAP', async () => {
    const user = userEvent.setup()
    vi.mocked(api.workouts.create).mockResolvedValue({ id: 'new-1', status: 'DRAFT' } as never)

    const props = defaultProps()
    render(<WorkoutDrawer {...props} />)
    await waitFor(() => expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('e.g. Fran'), 'Cindy')
    await user.type(screen.getByPlaceholderText(/Workout details/), '20-min AMRAP of …')
    await user.type(screen.getByLabelText(/Time cap/), '20:00')
    await user.click(screen.getByLabelText(/Track rounds/))

    await user.click(screen.getByText('Save as Draft'))

    await waitFor(() => expect(api.workouts.create).toHaveBeenCalled())
    const [, payload] = vi.mocked(api.workouts.create).mock.calls[0]
    expect(payload).toMatchObject({
      title: 'Cindy',
      type: 'AMRAP',
      timeCapSeconds: 1200,
      tracksRounds: true,
    })
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
