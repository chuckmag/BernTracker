/**
 * LogResultScreen tests
 *
 * Covers the create + edit + delete paths:
 *   - AMRAP and FOR_TIME form variants
 *   - Validation (out-of-range values block submit)
 *   - 409 "already logged" handling
 *   - Unsupported workout types show warning + disable submit
 *   - Edit mode (existingResult) calls api.results.update
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

const AMRAP_WORKOUT = {
  id: 'w-1',
  title: 'Cindy',
  description: '20 min AMRAP of 5 pull-ups, 10 push-ups, 15 air squats',
  type: 'AMRAP' as const,
  status: 'PUBLISHED' as const,
  scheduledAt: '2026-04-15T12:00:00.000Z',
  programId: null,
}
const FOR_TIME_WORKOUT = { ...AMRAP_WORKOUT, id: 'w-2', title: 'Fran', type: 'FOR_TIME' as const }
const STRENGTH_WORKOUT = { ...AMRAP_WORKOUT, id: 'w-3', title: 'Back Squat 5x5', type: 'STRENGTH' as const }

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

describe('LogResultScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setUser('MALE')
  })

  test('AMRAP: rounds + reps submit calls api.workouts.logResult with derived workoutGender', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(AMRAP_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({})

    const navigation = makeNavigation()
    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={navigation} route={makeRoute()} />,
    )

    await findByText('Cindy')

    fireEvent.changeText(getByTestId('rounds-input'), '5')
    fireEvent.changeText(getByTestId('reps-input'), '12')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => {
      expect(api.workouts.logResult).toHaveBeenCalledWith('w-1', {
        level: 'RX',
        workoutGender: 'MALE',
        value: { type: 'AMRAP', rounds: 5, reps: 12 },
        notes: undefined,
      })
    })
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('FOR_TIME: minutes + seconds collapse to seconds=m*60+s', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(FOR_TIME_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({})

    const navigation = makeNavigation()
    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={navigation} route={makeRoute({ workoutId: 'w-2' })} />,
    )

    await findByText('Fran')
    fireEvent.changeText(getByTestId('minutes-input'), '8')
    fireEvent.changeText(getByTestId('seconds-input'), '45')
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => {
      expect(api.workouts.logResult).toHaveBeenCalledWith('w-2', expect.objectContaining({
        value: { type: 'FOR_TIME', seconds: 525, cappedOut: false },
      }))
    })
  })

  test('FOR_TIME capped toggle sets cappedOut=true and uses seconds=0', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(FOR_TIME_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({})

    const navigation = makeNavigation()
    const { findByText, getByTestId } = render(
      <LogResultScreen navigation={navigation} route={makeRoute({ workoutId: 'w-2' })} />,
    )

    await findByText('Fran')
    fireEvent.press(getByTestId('capped-toggle'))
    fireEvent.press(await findByText('Log result'))

    await waitFor(() => {
      expect(api.workouts.logResult).toHaveBeenCalledWith('w-2', expect.objectContaining({
        value: { type: 'FOR_TIME', seconds: 0, cappedOut: true },
      }))
    })
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
    ;(api.workouts.get as jest.Mock).mockResolvedValue(AMRAP_WORKOUT)
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

  test('unsupported workout type shows yellow warning and disables submit', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(STRENGTH_WORKOUT)

    const { findByText } = render(
      <LogResultScreen navigation={makeNavigation()} route={makeRoute({ workoutId: 'w-3' })} />,
    )

    await findByText('Back Squat 5x5')
    await findByText(/Result logging is not yet supported/)

    fireEvent.press(await findByText('Log result'))
    expect(api.workouts.logResult).not.toHaveBeenCalled()
  })

  test('edit mode prefills inputs and submits via api.results.update', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(AMRAP_WORKOUT)
    ;(api.results.update as jest.Mock).mockResolvedValue({})
    const existingResult = {
      id: 'r-1',
      user: { id: 'me', name: 'Me' },
      level: 'SCALED',
      workoutGender: 'OPEN',
      value: { type: 'AMRAP', rounds: 4, reps: 8 },
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

    // Bump the reps and save
    fireEvent.changeText(getByTestId('reps-input'), '9')
    fireEvent.press(await findByText('Save changes'))

    await waitFor(() => {
      expect(api.results.update).toHaveBeenCalledWith('r-1', expect.objectContaining({
        value: { type: 'AMRAP', rounds: 4, reps: 9 },
        level: 'SCALED',
      }))
    })
    expect(api.workouts.logResult).not.toHaveBeenCalled()
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('delete: confirmation triggers api.results.delete + goBack', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(AMRAP_WORKOUT)
    ;(api.results.delete as jest.Mock).mockResolvedValue(undefined)

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const del = buttons?.find((b) => b.text === 'Delete')
      del?.onPress?.()
    })

    const existingResult = {
      id: 'r-1',
      user: { id: 'me', name: 'Me' },
      level: 'RX',
      workoutGender: 'OPEN',
      value: { type: 'AMRAP', rounds: 1, reps: 1 },
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
    ;(api.workouts.get as jest.Mock).mockResolvedValue(AMRAP_WORKOUT)
    ;(api.workouts.logResult as jest.Mock).mockResolvedValue({})

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
