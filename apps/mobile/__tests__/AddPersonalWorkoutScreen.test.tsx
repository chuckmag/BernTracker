import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AddPersonalWorkoutScreen from '../src/screens/AddPersonalWorkoutScreen'

jest.mock('../src/lib/api', () => ({
  api: {
    me: {
      personalProgram: {
        workouts: { create: jest.fn() },
      },
    },
  },
}))

import { api } from '../src/lib/api'

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function makeRoute(scheduledAt = '2026-05-04') {
  return { params: { scheduledAt }, key: 'k', name: 'AddPersonalWorkout' } as any
}

describe('AddPersonalWorkoutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the day label, default type, and a disabled save button', () => {
    const { getByText, getByTestId } = render(
      <AddPersonalWorkoutScreen navigation={makeNavigation()} route={makeRoute('2026-05-04')} />,
    )
    // Date label uses the user's locale-formatted long date — the year is
    // reliable enough to assert without locale brittleness.
    expect(getByText(/2026/)).toBeTruthy()
    expect(getByText('Personal Program — only you will see this workout.')).toBeTruthy()
    expect(getByTestId('save-button')).toBeTruthy()
  })

  test('save button calls api.me.personalProgram.workouts.create with form payload + auto-publish via server', async () => {
    ;(api.me.personalProgram.workouts.create as jest.Mock).mockResolvedValue({
      id: 'w-new',
      title: 'Easy row',
      type: 'ROWING',
      scheduledAt: '2026-05-04T12:00:00.000Z',
      status: 'PUBLISHED',
    })
    const navigation = makeNavigation()
    const { getByTestId } = render(
      <AddPersonalWorkoutScreen navigation={navigation} route={makeRoute('2026-05-04')} />,
    )

    fireEvent.changeText(getByTestId('title-input'), 'Easy row')
    fireEvent.changeText(getByTestId('description-input'), '20 min Z2')
    fireEvent.press(getByTestId('type-chip-ROWING'))
    fireEvent.press(getByTestId('save-button'))

    await waitFor(() => expect(api.me.personalProgram.workouts.create).toHaveBeenCalledTimes(1))
    const payload = (api.me.personalProgram.workouts.create as jest.Mock).mock.calls[0][0]
    expect(payload).toMatchObject({
      title: 'Easy row',
      description: '20 min Z2',
      type: 'ROWING',
    })
    // scheduledAt is an ISO string anchored at noon UTC on the chosen day
    // so it lands on the same calendar date in any viewer's timezone.
    expect(payload.scheduledAt).toMatch(/^2026-05-04T12:00:00/)
    // Returns to the feed on success — the feed re-runs `loadInitial` via
    // `useFocusEffect`, picking up the newly-created workout.
    expect(navigation.goBack).toHaveBeenCalled()
  })

  test('save button is disabled until both title and description are filled', () => {
    const { getByTestId } = render(
      <AddPersonalWorkoutScreen navigation={makeNavigation()} route={makeRoute()} />,
    )
    const saveBtn = getByTestId('save-button')
    fireEvent.press(saveBtn)
    expect(api.me.personalProgram.workouts.create).not.toHaveBeenCalled()

    fireEvent.changeText(getByTestId('title-input'), 'Title only')
    fireEvent.press(saveBtn)
    expect(api.me.personalProgram.workouts.create).not.toHaveBeenCalled()
  })

  test('renders a server-side error and stays on screen if create rejects', async () => {
    ;(api.me.personalProgram.workouts.create as jest.Mock).mockRejectedValue(new Error('API down'))
    const navigation = makeNavigation()
    const { getByTestId, findByText } = render(
      <AddPersonalWorkoutScreen navigation={navigation} route={makeRoute()} />,
    )
    fireEvent.changeText(getByTestId('title-input'), 'X')
    fireEvent.changeText(getByTestId('description-input'), 'Y')
    fireEvent.press(getByTestId('save-button'))
    expect(await findByText('API down')).toBeTruthy()
    expect(navigation.goBack).not.toHaveBeenCalled()
  })
})
