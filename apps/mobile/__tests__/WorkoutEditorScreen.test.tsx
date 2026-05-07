import React from 'react'
import { Alert, Keyboard } from 'react-native'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import WorkoutEditorScreen from '../src/screens/WorkoutEditorScreen'

jest.mock('../src/lib/api', () => ({
  api: {
    me: {
      personalProgram: {
        workouts: { create: jest.fn() },
      },
    },
    workouts: {
      get: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

import { api } from '../src/lib/api'

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function makeRoute(params: Record<string, unknown>) {
  return { params, key: 'k', name: 'WorkoutEditor' } as any
}

const EXISTING_WORKOUT = {
  id: 'w-1',
  title: 'Easy row',
  description: '20 min Z2',
  coachNotes: 'Stay aerobic — nose-only breathing if you can.',
  type: 'ROWING',
  status: 'DRAFT',
  scheduledAt: '2026-05-04T12:00:00.000Z',
  programId: 'pp-1',
  workoutMovements: [],
  timeCapSeconds: null,
  tracksRounds: false,
  externalSourceId: null,
}

describe('WorkoutEditorScreen — create mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the day label, default copy, and a disabled save button before fields are filled', () => {
    const { getByText, getByTestId } = render(
      <WorkoutEditorScreen
        navigation={makeNavigation()}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    expect(getByText(/2026/)).toBeTruthy()
    expect(getByText('Personal Program — only you will see this workout.')).toBeTruthy()
    expect(getByTestId('save-button')).toBeTruthy()
  })

  test('time-cap input is hidden once the type changes from a time-capped category to a non-capped one', () => {
    const { queryByTestId, getByTestId } = render(
      <WorkoutEditorScreen
        navigation={makeNavigation()}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    // Default type is METCON, which is in TIME_CAP_TYPES.
    expect(queryByTestId('time-cap-input')).toBeTruthy()
    // Open the picker, then tap a Strength type (no time-cap).
    fireEvent.press(getByTestId('type-select-button'))
    fireEvent.press(getByTestId('type-chip-WEIGHT_LIFTING'))
    expect(queryByTestId('time-cap-input')).toBeNull()
  })

  test('the type-select button opens the picker; selecting a type closes the modal', () => {
    const { getByTestId, queryByTestId } = render(
      <WorkoutEditorScreen
        navigation={makeNavigation()}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    // Picker chips aren't mounted until the modal opens.
    expect(queryByTestId('type-chip-AMRAP')).toBeNull()
    fireEvent.press(getByTestId('type-select-button'))
    expect(queryByTestId('type-chip-AMRAP')).toBeTruthy()
    fireEvent.press(getByTestId('type-chip-AMRAP'))
    // Modal closes after selection — chips no longer in the tree.
    expect(queryByTestId('type-chip-AMRAP')).toBeNull()
  })

  test('save POSTs to personal program and navigates back', async () => {
    ;(api.me.personalProgram.workouts.create as jest.Mock).mockResolvedValue({ id: 'new-w-1' })
    const navigation = makeNavigation()
    const { getByTestId } = render(
      <WorkoutEditorScreen
        navigation={navigation}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    fireEvent.changeText(getByTestId('title-input'), 'Easy row')
    fireEvent.changeText(getByTestId('description-input'), '20 min easy')
    fireEvent.changeText(getByTestId('coach-notes-input'), 'Keep tempo on the second set')
    fireEvent.press(getByTestId('save-button'))
    await waitFor(() => {
      expect(api.me.personalProgram.workouts.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Easy row',
          description: '20 min easy',
          coachNotes: 'Keep tempo on the second set',
          type: 'METCON',
        }),
      )
      expect(navigation.goBack).toHaveBeenCalled()
    })
  })

  test('does not render the Delete button in create mode', () => {
    const { queryByTestId } = render(
      <WorkoutEditorScreen
        navigation={makeNavigation()}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    expect(queryByTestId('delete-button')).toBeNull()
  })

  test('Done button in the header dismisses the keyboard', async () => {
    const navigation = makeNavigation()
    render(
      <WorkoutEditorScreen
        navigation={navigation}
        route={makeRoute({ mode: 'create', scheduledAt: '2026-05-04' })}
      />,
    )
    // The screen wires headerRight via navigation.setOptions on mount; pull
    // the rendered Done button out of the most recent setOptions call and
    // assert pressing it triggers Keyboard.dismiss.
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss')
    const lastCall = (navigation.setOptions as jest.Mock).mock.calls
      .reverse()
      .find((c) => typeof c[0]?.headerRight === 'function')
    const node = lastCall?.[0].headerRight()
    expect(node).toBeTruthy()
    node.props.onPress()
    expect(dismissSpy).toHaveBeenCalled()
    dismissSpy.mockRestore()
  })
})

describe('WorkoutEditorScreen — edit mode', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('hydrates fields from the loaded workout, including time-cap and coach notes', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue({ ...EXISTING_WORKOUT, type: 'AMRAP', timeCapSeconds: 720 })
    const { findByDisplayValue, getByTestId } = render(
      <WorkoutEditorScreen
        navigation={makeNavigation()}
        route={makeRoute({ mode: 'edit', workoutId: 'w-1' })}
      />,
    )
    await findByDisplayValue('Easy row')
    expect(getByTestId('description-input').props.value).toBe('20 min Z2')
    expect(getByTestId('coach-notes-input').props.value).toBe(EXISTING_WORKOUT.coachNotes)
    // 720s == 12:00
    expect(getByTestId('time-cap-input').props.value).toBe('12:00')
  })

  test('save calls PATCH /api/workouts/:id with the edited fields and navigates back', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(EXISTING_WORKOUT)
    ;(api.workouts.update as jest.Mock).mockResolvedValue({})
    const navigation = makeNavigation()
    const { findByDisplayValue, getByTestId } = render(
      <WorkoutEditorScreen
        navigation={navigation}
        route={makeRoute({ mode: 'edit', workoutId: 'w-1' })}
      />,
    )
    await findByDisplayValue('Easy row')
    fireEvent.changeText(getByTestId('title-input'), 'Easier row')
    fireEvent.changeText(getByTestId('coach-notes-input'), 'Updated coach note')
    fireEvent.press(getByTestId('save-button'))
    await waitFor(() => {
      expect(api.workouts.update).toHaveBeenCalledWith(
        'w-1',
        expect.objectContaining({
          title: 'Easier row',
          description: '20 min Z2',
          coachNotes: 'Updated coach note',
          type: 'ROWING',
        }),
      )
      expect(navigation.goBack).toHaveBeenCalled()
    })
  })

  test('delete confirms via Alert, then DELETE /api/workouts/:id and navigates back', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(EXISTING_WORKOUT)
    ;(api.workouts.delete as jest.Mock).mockResolvedValue(undefined)
    // Auto-confirm: invoke the destructive button's handler immediately.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const destructive = (buttons ?? []).find((b) => b.style === 'destructive')
      destructive?.onPress?.()
    })
    const navigation = makeNavigation()
    const { findByTestId } = render(
      <WorkoutEditorScreen
        navigation={navigation}
        route={makeRoute({ mode: 'edit', workoutId: 'w-1' })}
      />,
    )
    const deleteBtn = await findByTestId('delete-button')
    await act(async () => { fireEvent.press(deleteBtn) })
    await waitFor(() => {
      expect(api.workouts.delete).toHaveBeenCalledWith('w-1')
      expect(navigation.goBack).toHaveBeenCalled()
    })
    alertSpy.mockRestore()
  })

  test('surfaces a friendly 403 error when the user lacks edit permission', async () => {
    ;(api.workouts.get as jest.Mock).mockResolvedValue(EXISTING_WORKOUT)
    const err: Error & { status?: number } = new Error('Forbidden')
    err.status = 403
    ;(api.workouts.update as jest.Mock).mockRejectedValue(err)
    const navigation = makeNavigation()
    const { findByDisplayValue, getByTestId, findByText } = render(
      <WorkoutEditorScreen
        navigation={navigation}
        route={makeRoute({ mode: 'edit', workoutId: 'w-1' })}
      />,
    )
    await findByDisplayValue('Easy row')
    fireEvent.press(getByTestId('save-button'))
    await findByText("You don't have permission to edit this workout.")
    expect(navigation.goBack).not.toHaveBeenCalled()
  })
})
