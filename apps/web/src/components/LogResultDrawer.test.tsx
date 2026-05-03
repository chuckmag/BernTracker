import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LogResultDrawer from './LogResultDrawer'
import type { Workout, WorkoutResult } from '../lib/api'

vi.mock('../context/AuthContext.tsx', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Me', identifiedGender: 'MALE' } }),
}))

vi.mock('../lib/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      results: {
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
      },
    },
    apiFetch: vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({}) }),
  }
})

import { api, apiFetch } from '../lib/api.ts'

const FETCH_MOCK = apiFetch as unknown as ReturnType<typeof vi.fn>
const RESULTS_UPDATE = api.results.update as unknown as ReturnType<typeof vi.fn>

function makeMovement(id: string, name: string, prescription: Partial<Workout['workoutMovements'][number]> = {}): Workout['workoutMovements'][number] {
  return {
    movement: { id, name, parentId: null },
    displayOrder: 0,
    sets: null, reps: null, load: null, loadUnit: null,
    // Mirrors the API default (Prisma column has @default(true)). Tests
    // override to false explicitly to suppress the Load column.
    tracksLoad: true,
    tempo: null,
    distance: null, distanceUnit: null, calories: null, seconds: null,
    ...prescription,
  }
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w-1',
    title: 'Test Workout',
    description: 'desc',
    type: 'POWER_LIFTING',
    status: 'PUBLISHED',
    scheduledAt: '2026-04-30T10:00:00.000Z',
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    timeCapSeconds: null,
    tracksRounds: false,
    _count: { results: 0 },
    createdAt: '2026-04-29T00:00:00.000Z',
    updatedAt: '2026-04-29T00:00:00.000Z',
    ...overrides,
  }
}

describe('LogResultDrawer — strength sets table', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('renders one set row per prescribed set with prescription values pre-filled', () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [
        makeMovement('m-1', 'Back Squat', { displayOrder: 0, sets: 5, reps: '5', load: 225, loadUnit: 'LB', tempo: '3.1.1.0' }),
      ],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    // Five rows × ("Set N Reps" + "Set N Load" + "Set N Tempo") inputs
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(5)
    expect(screen.getAllByLabelText(/Set \d Load/i)).toHaveLength(5)
    expect(screen.getAllByLabelText(/Set \d Tempo/i)).toHaveLength(5)
    // Prescribed values pre-fill every row
    expect((screen.getByLabelText(/Set 1 Reps/i) as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText(/Set 3 Load/i) as HTMLInputElement).value).toBe('225')
    expect((screen.getByLabelText(/Set 5 Tempo/i) as HTMLInputElement).value).toBe('3.1.1.0')
  })

  test('Strength workout without prescribed load still surfaces a Load column on the result form', () => {
    // Programmers don't prescribe load on strength workouts (slice 2B), but
    // Load is the headline number a member came to record.
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 3, reps: '3' })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)
    expect(screen.getAllByLabelText(/Set \d Load/i)).toHaveLength(3)
  })

  test('Strength result form hides distance / cals / seconds add-column buttons', () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5' })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)
    // Tempo is reachable for strength; distance / cals / seconds aren't.
    expect(screen.getByRole('button', { name: '+ Tempo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Distance' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Cals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Seconds' })).not.toBeInTheDocument()
  })

  test('movement with tracksLoad=false hides the Load column entirely', () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      // Plyometric piece — Box Jump 5×5, no load tracked.
      workoutMovements: [makeMovement('m-1', 'Box Jump', { sets: 5, reps: '5', tracksLoad: false })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(5)
    // No Load column header / inputs, and no "+ Load" button to surface one.
    expect(screen.queryAllByLabelText(/Set \d Load/i)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '+ Load' })).not.toBeInTheDocument()
  })

  test('+ Add set appends a row and × removes one', () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 2, reps: '5', load: 200, loadUnit: 'LB' })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '+ Add set' }))
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)
    fireEvent.click(screen.getByLabelText('Remove set 3'))
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)
  })

  test('switches between movement tabs', () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [
        makeMovement('m-1', 'Back Squat', { displayOrder: 0, sets: 2, reps: '5' }),
        makeMovement('m-2', 'RDL',        { displayOrder: 1, sets: 3, reps: '10' }),
      ],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    // Defaults to first movement: 2 set rows.
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)
    fireEvent.click(screen.getByRole('tab', { name: 'RDL' }))
    expect(screen.getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)
  })

  test('submitting a strength result POSTs movementResults with parsed values', async () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 225, loadUnit: 'LB' })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/Set 1 Load/i), { target: { value: '235' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    await waitFor(() => expect(FETCH_MOCK).toHaveBeenCalledTimes(1))
    const body = JSON.parse(FETCH_MOCK.mock.calls[0][1].body)
    expect(body.value.movementResults[0]).toMatchObject({
      workoutMovementId: 'm-1',
      loadUnit: 'LB',
      sets: [{ reps: '5', load: 235 }],
    })
  })

  test('cluster reps "1.1.1" pass; bad reps "abc" surface an error and block submit', async () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 200, loadUnit: 'LB' })],
    })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/Set 1 Reps/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))
    await screen.findByText(/reps must be digits/i)
    expect(FETCH_MOCK).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Set 1 Reps/i), { target: { value: '1.1.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))
    await waitFor(() => expect(FETCH_MOCK).toHaveBeenCalledTimes(1))
  })
})

describe('LogResultDrawer — score-mode workouts', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('AMRAP with tracksRounds=false hides the rounds input', () => {
    const w = makeWorkout({ type: 'AMRAP', tracksRounds: false })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.queryByLabelText(/^Rounds$/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Reps$/i)).toBeInTheDocument()
  })

  test('AMRAP with tracksRounds=true posts ROUNDS_REPS score', async () => {
    const w = makeWorkout({ type: 'AMRAP', tracksRounds: true })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^Rounds$/i), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/^Reps$/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    await waitFor(() => expect(FETCH_MOCK).toHaveBeenCalledTimes(1))
    const body = JSON.parse(FETCH_MOCK.mock.calls[0][1].body)
    expect(body.value.score).toEqual({ kind: 'ROUNDS_REPS', rounds: 6, reps: 12, cappedOut: false })
    expect(body.value.movementResults).toEqual([])
  })

  test('FOR_TIME posts TIME score with collapsed seconds', async () => {
    const w = makeWorkout({ type: 'FOR_TIME' })
    render(<LogResultDrawer workout={w} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByLabelText(/^Min$/i), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText(/^Sec$/i), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Result' }))

    await waitFor(() => expect(FETCH_MOCK).toHaveBeenCalledTimes(1))
    const body = JSON.parse(FETCH_MOCK.mock.calls[0][1].body)
    expect(body.value.score).toEqual({ kind: 'TIME', seconds: 525, cappedOut: false })
  })
})

describe('LogResultDrawer — edit mode', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('edit mode pre-fills strength sets and PATCHes via api.results.update', async () => {
    const w = makeWorkout({
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 225, loadUnit: 'LB' })],
    })
    const existing: WorkoutResult = {
      id: 'r-1',
      userId: 'u1',
      workoutId: 'w-1',
      level: 'RX',
      workoutGender: 'MALE',
      value: {
        movementResults: [
          { workoutMovementId: 'm-1', loadUnit: 'LB', sets: [{ reps: '5', load: 245, tempo: '3.1.1.0' }] },
        ],
      },
      notes: null,
      createdAt: '2026-04-29T00:00:00.000Z',
      user: { id: 'u1', name: 'Me', firstName: null, lastName: null, email: 'me@test.com', avatarUrl: null, birthday: null },
      workout: { type: 'POWER_LIFTING' },
    }
    render(<LogResultDrawer workout={w} existingResult={existing} onClose={() => {}} onSaved={() => {}} />)

    expect((screen.getByLabelText(/Set 1 Load/i) as HTMLInputElement).value).toBe('245')
    expect((screen.getByLabelText(/Set 1 Tempo/i) as HTMLInputElement).value).toBe('3.1.1.0')

    fireEvent.change(screen.getByLabelText(/Set 1 Load/i), { target: { value: '255' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Result' }))

    await waitFor(() => expect(RESULTS_UPDATE).toHaveBeenCalledTimes(1))
    expect(RESULTS_UPDATE.mock.calls[0][0]).toBe('r-1')
    expect(RESULTS_UPDATE.mock.calls[0][1].value.movementResults[0].sets[0].load).toBe(255)
    expect(FETCH_MOCK).not.toHaveBeenCalled()
  })
})
