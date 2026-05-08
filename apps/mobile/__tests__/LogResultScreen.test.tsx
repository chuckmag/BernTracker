/**
 * LogResultScreen tests
 *
 * Covers:
 *   - Strength workouts render per-movement sets tables (slice 3)
 *   - Add / remove set rows
 *   - Switching movement tabs
 *   - Cluster reps "1.1.1" pass; bad reps "abc" surface an error
 *   - Submitting a strength result POSTs movementResults
 *   - AMRAP with tracksRounds=false hides the rounds input
 *   - AMRAP with tracksRounds=true posts ROUNDS_REPS score
 *   - FOR_TIME collapses minutes/seconds + capped toggle
 *   - 409 "already logged" handling
 *   - Edit mode pre-fills + PATCHes via api.results.update
 *   - Delete via Alert.alert + api.results.delete
 *   - Gender derivation from useAuth().user.identifiedGender
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import LogResultScreen from '../src/screens/LogResultScreen'

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    workouts: {
      get: jest.fn(),
      logResult: jest.fn(),
    },
    results: {
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
  deriveWorkoutGender: jest.requireActual('@wodalytics/types').deriveWorkoutGender,
}))

import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/lib/api'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeMovement(id: string, name: string, prescription: any = {}) {
  return {
    movement: { id, name, parentId: null },
    displayOrder: 0,
    sets: null, reps: null, load: null, loadUnit: null, tempo: null,
    distance: null, distanceUnit: null, calories: null, seconds: null,
    // Mirrors the API default — Prisma column has @default(true), so reads
    // always carry a populated tracksLoad. Tests that need to suppress the
    // Load column override this to false explicitly.
    tracksLoad: true,
    ...prescription,
  }
}

function makeWorkout(overrides: any = {}) {
  return {
    id: 'w-1',
    title: 'Cindy',
    description: '20 min AMRAP of 5 pull-ups, 10 push-ups, 15 air squats',
    type: 'AMRAP' as const,
    status: 'PUBLISHED' as const,
    scheduledAt: '2026-04-15T12:00:00.000Z',
    programId: null,
    workoutMovements: [],
    timeCapSeconds: null,
    tracksRounds: true,
    ...overrides,
  }
}

const STRENGTH_WORKOUT = makeWorkout({
  id: 'w-3',
  title: 'Back Squat 5x5',
  type: 'POWER_LIFTING',
  workoutMovements: [
    makeMovement('m-1', 'Back Squat', { displayOrder: 0, sets: 5, reps: '5', load: 225, loadUnit: 'LB', tempo: '3.1.1.0', tracksLoad: true }),
  ],
})

// Strength prescription with no load prescribed — programmers leave the
// actual weight to the member. tracksLoad still defaults to true on the API
// side, so the Load column should auto-show.
const STRENGTH_WORKOUT_NO_LOAD = makeWorkout({
  id: 'w-4',
  title: 'Back Squat — heavy triple',
  type: 'POWER_LIFTING',
  workoutMovements: [
    makeMovement('m-1', 'Back Squat', { displayOrder: 0, sets: 3, reps: '3', tracksLoad: true }),
  ],
})

// Strength prescription with tracksLoad explicitly off — e.g. plyometric box
// jumps where load isn't relevant. The Load column should NOT render.
const STRENGTH_WORKOUT_NO_LOAD_TRACKING = makeWorkout({
  id: 'w-5',
  title: 'Box Jumps 5x5',
  type: 'POWER_LIFTING',
  workoutMovements: [
    makeMovement('m-1', 'Box Jump', { displayOrder: 0, sets: 5, reps: '5', tracksLoad: false }),
  ],
})

const FOR_TIME_WORKOUT = makeWorkout({ id: 'w-2', title: 'Fran', type: 'FOR_TIME', tracksRounds: false })

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function makeRoute(params: any = {}) {
  return { params: { workoutId: 'w-1', ...params } } as any
}

function setUser(identifiedGender: 'MALE' | 'FEMALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | null) {
  ;(useAuth as jest.Mock).mockReturnValue({
    user: { id: 'me', email: 'me@gym.com', name: 'Me', identifiedGender },
    isLoading: false,
    login: jest.fn(),
    loginWithGoogle: jest.fn(),
    logout: jest.fn(),
  })
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('LogResultScreen — strength sets table', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setUser('MALE')
  })

  test('renders one row per prescribed set with prescription values pre-filled', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(STRENGTH_WORKOUT)

    const { findByText, getAllByLabelText, getByLabelText } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Back Squat 5x5')

    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(5)
    expect(getAllByLabelText(/Set \d Load/i)).toHaveLength(5)
    expect(getAllByLabelText(/Set \d Tempo/i)).toHaveLength(5)

    // Prescribed values pre-fill every row
    expect(getByLabelText(/Set 1 Reps/i).props.value).toBe('5')
    expect(getByLabelText(/Set 3 Load/i).props.value).toBe('225')
    expect(getByLabelText(/Set 5 Tempo/i).props.value).toBe('3.1.1.0')
  })

  test('strength workout without prescribed load still surfaces a Load column', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(STRENGTH_WORKOUT_NO_LOAD)

    const { findByText, getAllByLabelText } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-4' })} />,
    )

    await findByText('Back Squat — heavy triple')

    // Three rows from `sets: 3`, each carrying both Reps and Load even though
    // the programmer only prescribed reps. tracksLoad defaults to true on the
    // server, so the Load column auto-shows.
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)
    expect(getAllByLabelText(/Set \d Load/i)).toHaveLength(3)
  })

  test('strength workout with tracksLoad=false hides the Load column entirely', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(STRENGTH_WORKOUT_NO_LOAD_TRACKING)

    const { findByText, getAllByLabelText, queryAllByLabelText, queryByLabelText } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-5' })} />,
    )

    await findByText('Box Jumps 5x5')

    // Reps column still renders (strength baseline). Load column must be
    // suppressed because tracksLoad=false on the prescription.
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(5)
    expect(queryAllByLabelText(/Set \d Load/i)).toHaveLength(0)
    // The "+ Load" reachable column button must not appear either, since
    // tracksLoad=false makes Load unreachable for this movement.
    expect(queryByLabelText(/Add Load column/i)).toBeNull()
  })

  test('+ Add set appends a row and × removes one', async () => {
    const w = makeWorkout({
      id: 'w-3',
      title: 'Back Squat',
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 2, reps: '5', load: 200, loadUnit: 'LB' })],
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)

    const { findByText, getAllByLabelText, getByLabelText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Back Squat')
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)

    fireEvent.press(getByTestId('add-set'))
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)

    fireEvent.press(getByLabelText(/Remove set 3/i))
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)
  })

  test('switches between movement tabs', async () => {
    const w = makeWorkout({
      id: 'w-3',
      title: 'Squat + RDL',
      type: 'POWER_LIFTING',
      workoutMovements: [
        makeMovement('m-1', 'Back Squat', { displayOrder: 0, sets: 2, reps: '5' }),
        makeMovement('m-2', 'RDL',         { displayOrder: 1, sets: 3, reps: '10' }),
      ],
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)

    const { findByText, getAllByLabelText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Squat + RDL')
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(2)

    fireEvent.press(getByTestId('movement-tab-1'))
    expect(getAllByLabelText(/Set \d Reps/i)).toHaveLength(3)
  })

  test('submitting a strength result POSTs movementResults with parsed values', async () => {
    const w = makeWorkout({
      id: 'w-3',
      title: 'Back Squat',
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 225, loadUnit: 'LB' })],
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const navigation = makeNavigation()
    const { findByText, getByLabelText } = render(
      <LogResultScreen navigation={navigation} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Back Squat')
    fireEvent.changeText(getByLabelText(/Set 1 Load/i), '235')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => expect(api.workouts.logResult).toHaveBeenCalledTimes(1))
    const [, payload] = (api.workouts.logResult as jest.Mock).mock.calls[0]
    expect(payload.value.movementResults[0]).toMatchObject({
      workoutMovementId: 'm-1',
      loadUnit: 'LB',
      sets: [{ reps: '5', load: 235 }],
    })
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('cluster reps "1.1.1" pass; bad reps "abc" surface an error and block submit', async () => {
    const w = makeWorkout({
      id: 'w-3',
      title: 'Back Squat',
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 200, loadUnit: 'LB' })],
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const { findByText, getByLabelText } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Back Squat')

    // "abc" → error, no API call
    fireEvent.changeText(getByLabelText(/Set 1 Reps/i), 'abc')
    fireEvent.press(await findByText('Log result'))
    await findByText(/reps must be digits/i)
    expect(api.workouts.logResult).not.toHaveBeenCalled()

    // "1.1.1" → passes
    fireEvent.changeText(getByLabelText(/Set 1 Reps/i), '1.1.1')
    fireEvent.press(await findByText('Log result'))
    await waitFor(() => expect(api.workouts.logResult).toHaveBeenCalledTimes(1))
  })

  test('edit mode pre-fills strength sets and PATCHes via api.results.update', async () => {
    const w = makeWorkout({
      id: 'w-3',
      title: 'Back Squat',
      type: 'POWER_LIFTING',
      workoutMovements: [makeMovement('m-1', 'Back Squat', { sets: 1, reps: '5', load: 225, loadUnit: 'LB' })],
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)
    ;(api.results.update as jest.Mock).mockResolvedValue({})

    const existingResult = {
      id: 'r-1',
      user: { id: 'me', name: 'Me' },
      level: 'RX' as const,
      workoutGender: 'MALE' as const,
      value: {
        movementResults: [
          { workoutMovementId: 'm-1', loadUnit: 'LB', sets: [{ reps: '5', load: 245, tempo: '3.1.1.0' }] },
        ],
      },
      notes: null,
      createdAt: '2026-04-15T13:00:00.000Z',
    }

    const navigation = makeNavigation()
    const { findByText, getByLabelText } = render(
      <LogResultScreen
        navigation={navigation}
        route={makeRoute({ workoutId: 'w-3', resultId: 'r-1', existingResult })}
      />,
    )

    await findByText('Back Squat')
    expect(getByLabelText(/Set 1 Load/i).props.value).toBe('245')
    expect(getByLabelText(/Set 1 Tempo/i).props.value).toBe('3.1.1.0')

    fireEvent.changeText(getByLabelText(/Set 1 Load/i), '255')
    fireEvent.press(await findByText('Save changes'))

    await waitFor(() => expect(api.results.update).toHaveBeenCalledTimes(1))
    expect((api.results.update as jest.Mock).mock.calls[0][0]).toBe('r-1')
    expect((api.results.update as jest.Mock).mock.calls[0][1].value.movementResults[0].sets[0].load).toBe(255)
    expect(api.workouts.logResult).not.toHaveBeenCalled()
  })
})

describe('LogResultScreen — score-mode workouts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setUser('MALE')
  })

  test('AMRAP with tracksRounds=false hides the rounds input', async () => {
    const w = makeWorkout({ tracksRounds: false })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)

    const { findByText, queryByTestId, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Cindy')
    expect(queryByTestId('rounds-input')).toBeNull()
    expect(getByTestId('reps-input')).toBeTruthy()
  })

  test('AMRAP with tracksRounds=true posts ROUNDS_REPS score', async () => {
    const w = makeWorkout({ tracksRounds: true })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(w)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const navigation = makeNavigation()
    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={navigation} route={makeRoute()} />,
    )

    await findByText('Cindy')
    fireEvent.changeText(getByTestId('rounds-input'), '6')
    fireEvent.changeText(getByTestId('reps-input'), '12')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => expect(api.workouts.logResult).toHaveBeenCalledTimes(1))
    expect((api.workouts.logResult as jest.Mock).mock.calls[0][1]).toEqual({
      level: 'RX',
      workoutGender: 'MALE',
      value: { score: { kind: 'ROUNDS_REPS', rounds: 6, reps: 12, cappedOut: false }, movementResults: [] },
      notes: undefined,
    })
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('FOR_TIME posts TIME score with collapsed seconds', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(FOR_TIME_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-2' })} />,
    )

    await findByText('Fran')
    fireEvent.changeText(getByTestId('minutes-input'), '8')
    fireEvent.changeText(getByTestId('seconds-input'), '45')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => expect(api.workouts.logResult).toHaveBeenCalledTimes(1))
    expect((api.workouts.logResult as jest.Mock).mock.calls[0][1]).toEqual(expect.objectContaining({
      value: { score: { kind: 'TIME', seconds: 525, cappedOut: false }, movementResults: [] },
    }))
  })

  test('FOR_TIME capped toggle sets cappedOut=true and uses seconds=0', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(FOR_TIME_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-2' })} />,
    )

    await findByText('Fran')
    fireEvent.press(getByTestId('capped-toggle'))
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => expect(api.workouts.logResult).toHaveBeenCalledTimes(1))
    expect((api.workouts.logResult as jest.Mock).mock.calls[0][1]).toEqual(expect.objectContaining({
      value: { score: { kind: 'TIME', seconds: 0, cappedOut: true }, movementResults: [] },
    }))
  })

  test('validation: seconds > 59 surfaces error and does not call API', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(FOR_TIME_WORKOUT)

    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-2' })} />,
    )

    await findByText('Fran')
    fireEvent.changeText(getByTestId('minutes-input'), '5')
    fireEvent.changeText(getByTestId('seconds-input'), '60')
    fireEvent.press(await findByText('Log result'))

    await findByText(/Seconds must be 0–59/)
    expect(api.workouts.logResult).not.toHaveBeenCalled()
  })

  test('409 from API shows "You\'ve already logged this workout"', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(makeWorkout())
    const conflict = Object.assign(new Error('Already logged'), { status: 409 })
    ;(api.workouts.logResult as jest.Mock).mockRejectedValue(conflict)

    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Cindy')
    fireEvent.changeText(getByTestId('rounds-input'), '5')
    fireEvent.changeText(getByTestId('reps-input'), '0')
    fireEvent.press(await findByText('Log result'))

    await findByText("You've already logged this workout.")
  })
})

describe('LogResultScreen — edit + delete', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setUser('MALE')
  })

  test('edit mode prefills AMRAP inputs and PATCHes via api.results.update', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(makeWorkout())
    ;(api.results.update as jest.Mock).mockResolvedValue({})
    const existingResult = {
      id: 'r-1',
      user: { id: 'me', name: 'Me' },
      level: 'SCALED' as const,
      workoutGender: 'OPEN' as const,
      value: { score: { kind: 'ROUNDS_REPS', rounds: 4, reps: 8, cappedOut: false }, movementResults: [] },
      notes: null,
      createdAt: '2026-04-15T13:00:00.000Z',
    }

    const navigation = makeNavigation()
    const { findByText, getByTestId } = render(
      <LogResultScreen
        navigation={navigation}
        route={makeRoute({ resultId: 'r-1', existingResult })}
      />,
    )

    await findByText('Cindy')
    expect(getByTestId('rounds-input').props.value).toBe('4')
    expect(getByTestId('reps-input').props.value).toBe('8')

    fireEvent.changeText(getByTestId('reps-input'), '9')
    fireEvent.press(await findByText('Save changes'))

    await waitFor(() => {
      expect(api.results.update).toHaveBeenCalledWith('r-1', expect.objectContaining({
        value: { score: { kind: 'ROUNDS_REPS', rounds: 4, reps: 9, cappedOut: false }, movementResults: [] },
        level: 'SCALED',
      }))
    })
    expect(api.workouts.logResult).not.toHaveBeenCalled()
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('delete: confirmation triggers api.results.delete + goBack', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(makeWorkout())
    ;(api.results.delete as jest.Mock).mockResolvedValue(undefined)

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const del = buttons?.find((b) => b.text === 'Delete')
      del?.onPress?.()
    })

    const existingResult = {
      id: 'r-1',
      user: { id: 'me', name: 'Me' },
      level: 'RX' as const,
      workoutGender: 'OPEN' as const,
      value: { score: { kind: 'ROUNDS_REPS', rounds: 1, reps: 1, cappedOut: false }, movementResults: [] },
      notes: null,
      createdAt: '2026-04-15T13:00:00.000Z',
    }

    const navigation = makeNavigation()
    const { findByText } = render(
      <LogResultScreen
        navigation={navigation}
        route={makeRoute({ resultId: 'r-1', existingResult })}
      />,
    )

    await findByText('Cindy')
    fireEvent.press(await findByText('Delete result'))

    await waitFor(() => expect(api.results.delete).toHaveBeenCalledWith('r-1'))
    expect(navigation.goBack).toHaveBeenCalled()

    alertSpy.mockRestore()
  })

  test('NON_BINARY identifiedGender derives workoutGender=OPEN', async () => {
    setUser('NON_BINARY')
    ;(api.workouts.get as jest.Mock).mockResolvedValue(makeWorkout())
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({ result: {}, newPrs: [] })

    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Cindy')
    fireEvent.changeText(getByTestId('rounds-input'), '1')
    fireEvent.changeText(getByTestId('reps-input'), '1')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => {
      expect(api.workouts.logResult).toHaveBeenCalledWith('w-1', expect.objectContaining({
        workoutGender: 'OPEN',
      }))
    })
  })
})
