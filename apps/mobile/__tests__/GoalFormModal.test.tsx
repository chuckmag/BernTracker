/**
 * Unit tests for GoalFormModal — covers per-type validation, the LOAD rep
 * count toggle, and the SMART hint visibility rule.
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import GoalFormModal, { SMART_HINT_COPY } from '../src/components/GoalFormModal'
import type { GoalResponse } from '../src/lib/api'

jest.mock('../src/lib/api', () => ({
  api: {
    users: { me: { goals: { create: jest.fn(), update: jest.fn() } } },
    namedWorkouts: { list: jest.fn(() => Promise.resolve([])) },
    movements: { list: jest.fn(() => Promise.resolve([])) },
  },
}))

// MovementsContext expects a Provider — stub useMovements so the form can
// render in isolation. Returning a few movements covers the picker path.
jest.mock('../src/context/MovementsContext', () => ({
  useMovements: () => [
    { id: 'mv-squat', name: 'Back Squat', parentId: null, aliases: [] },
    { id: 'mv-dead', name: 'Deadlift', parentId: null, aliases: [] },
  ],
}))

// DateTimePicker pulls in native modules — stub it to a noop so the modal
// renders during tests without exploding on iOS-only props.
jest.mock('@react-native-community/datetimepicker', () => () => null)

import { api } from '../src/lib/api'

function noop() {}

function makeGoal(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'g1',
    userId: 'u1',
    type: 'PR_TARGET',
    status: 'ACTIVE',
    title: 'Edit me',
    targetDate: '2026-12-31T00:00:00.000Z',
    movementId: 'mv-squat',
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
    movement: { id: 'mv-squat', name: 'Back Squat' },
    namedWorkout: null,
    progress: { type: 'PR_TARGET', current: null, target: 315, unit: 'LB', percent: 0, isComplete: false },
    ...overrides,
  }
}

describe('GoalFormModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the SMART hint when no target date is set', async () => {
    const { findByText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={noop} />,
    )
    expect(await findByText(SMART_HINT_COPY)).toBeTruthy()
  })

  test('SMART hint absent on initial render in edit mode when targetDate is set', async () => {
    // Renamed from the misleading "hides the SMART hint when editing" — the
    // hint *appearance* on date-clear isn't exercised here because the
    // DateTimePicker module is stubbed to noop above. The honest scope is:
    // when targetDate starts non-null, the hint is not rendered on mount.
    // Coverage for the cleared-date path lives in the create-mode test
    // above (no targetDate → hint appears).
    const { queryByText } = render(
      <GoalFormModal
        mode="edit"
        initialGoal={makeGoal({ targetDate: '2026-12-31T00:00:00.000Z' })}
        onCancel={noop}
        onSaved={noop}
      />,
    )
    expect(queryByText(SMART_HINT_COPY)).toBeNull()
  })

  test('edit mode hides the per-type editors so unsupported fields are not visible', async () => {
    const { queryByText, queryByLabelText, findByLabelText } = render(
      <GoalFormModal
        mode="edit"
        initialGoal={makeGoal()}
        onCancel={noop}
        onSaved={noop}
      />,
    )
    // Edit-locked banner replaces the per-type subforms.
    expect(await findByLabelText('Edit locked notice')).toBeTruthy()
    // None of the PR-Target / Frequency editors render in edit mode.
    expect(queryByText('PR TYPE')).toBeNull()
    expect(queryByLabelText('Target value')).toBeNull()
    expect(queryByLabelText('Rep count')).toBeNull()
    expect(queryByLabelText('Workouts per week')).toBeNull()
    // Title is still editable.
    expect(queryByLabelText('Goal title')).toBeTruthy()
  })

  test('edit mode PATCH body only carries title + targetDate (regression for review #1)', async () => {
    // Locks in the fix for the deep-review's "edit silently discards
    // non-editable fields" bug. Even if a future refactor accidentally
    // re-renders the PR-Target inputs, the save path must still send only
    // the fields UpdateGoalSchema accepts.
    ;(api.users.me.goals.update as jest.Mock).mockResolvedValue(
      makeGoal({ title: 'Renamed squat goal' }),
    )
    const onSaved = jest.fn()
    const { getByText, getByLabelText } = render(
      <GoalFormModal
        mode="edit"
        initialGoal={makeGoal({ title: 'Old squat goal', targetValue: 315 })}
        onCancel={noop}
        onSaved={onSaved}
      />,
    )
    fireEvent.changeText(getByLabelText('Goal title'), 'Renamed squat goal')
    fireEvent.press(getByText('Save'))
    await waitFor(() => {
      expect(api.users.me.goals.update).toHaveBeenCalledTimes(1)
    })
    const [, patch] = (api.users.me.goals.update as jest.Mock).mock.calls[0]
    // PATCH body must contain ONLY the fields UpdateGoalSchema accepts.
    expect(Object.keys(patch).sort()).toEqual(['targetDate', 'title'])
    expect(patch.title).toBe('Renamed squat goal')
    // Sanity: nothing leaked through the save path.
    expect(patch.targetValue).toBeUndefined()
    expect(patch.targetPrType).toBeUndefined()
    expect(patch.movementId).toBeUndefined()
    expect(patch.frequencyPerWeek).toBeUndefined()
    expect(onSaved).toHaveBeenCalled()
  })

  test('PR Target LOAD shows REP COUNT field; switching to TIME hides it', async () => {
    const { queryByText, getByText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={noop} />,
    )
    // Defaults to PR_TARGET + LOAD, so REP COUNT is visible.
    expect(queryByText('REP COUNT')).toBeTruthy()

    // Open the PR TYPE picker and select TIME.
    fireEvent.press(getByText('Load')) // displayed value of LOAD pr type
    // The sheet renders the same options — tap "Time"
    fireEvent.press(getByText('Time'))
    await waitFor(() => {
      expect(queryByText('REP COUNT')).toBeNull()
    })
  })

  test('blocks create with missing title', async () => {
    const onSaved = jest.fn()
    const { getByText, findByText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={onSaved} />,
    )
    fireEvent.press(getByText('Create'))
    expect(await findByText('Title is required')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  test('blocks create with missing movement on PR Target', async () => {
    const onSaved = jest.fn()
    const { getByText, getByLabelText, findByText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={onSaved} />,
    )
    fireEvent.changeText(getByLabelText('Goal title'), 'Squat 315')
    fireEvent.changeText(getByLabelText('Target value'), '315')
    fireEvent.press(getByText('Create'))
    expect(await findByText('Pick a movement')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  test('inline movement combo: typing shows matching dropdown rows, tapping selects', async () => {
    // Replaces the old modal picker — typing in the combo's input shows
    // matching options inline (top 3); tap to pick. Confirms a typed-then-
    // picked flow ends in a create call that carries the right movementId.
    ;(api.users.me.goals.create as jest.Mock).mockResolvedValue(makeGoal())
    const onSaved = jest.fn()
    const { getByText, getByLabelText, findByLabelText, queryByLabelText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={onSaved} />,
    )
    // Before typing the dropdown row shouldn't render.
    expect(queryByLabelText('Select Back Squat')).toBeNull()
    const movementInput = getByLabelText('Choose movement')
    fireEvent.changeText(movementInput, 'back')
    // Top match should surface and be tappable.
    const row = await findByLabelText('Select Back Squat')
    fireEvent.press(row)
    // Fill in the rest of the form and submit.
    fireEvent.changeText(getByLabelText('Goal title'), 'Squat 315')
    fireEvent.changeText(getByLabelText('Target value'), '315')
    fireEvent.press(getByText('Create'))
    await waitFor(() => {
      expect(api.users.me.goals.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PR_TARGET',
          movementId: 'mv-squat',
          targetValue: 315,
        }),
      )
    })
  })

  test('FREQUENCY validates per-week and weeks ranges', async () => {
    const onSaved = jest.fn()
    const { getByText, getByLabelText, findByText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={onSaved} />,
    )
    // Switch to Frequency
    fireEvent.press(getByText('PR Target')) // type display
    fireEvent.press(getByText('Frequency'))

    fireEvent.changeText(getByLabelText('Goal title'), '3x/wk for a month')
    fireEvent.changeText(getByLabelText('Workouts per week'), '0')
    fireEvent.changeText(getByLabelText('Weeks'), '4')
    fireEvent.press(getByText('Create'))
    expect(await findByText(/Workouts per week must be 1.14/)).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  test('HABIT submits with only a title', async () => {
    ;(api.users.me.goals.create as jest.Mock).mockResolvedValue(makeGoal({ type: 'HABIT' }))
    const onSaved = jest.fn()
    const { getByText, getByLabelText } = render(
      <GoalFormModal mode="create" onCancel={noop} onSaved={onSaved} />,
    )
    fireEvent.press(getByText('PR Target'))
    fireEvent.press(getByText('Habit'))
    fireEvent.changeText(getByLabelText('Goal title'), 'Drink water')
    fireEvent.press(getByText('Create'))
    await waitFor(() => {
      expect(api.users.me.goals.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HABIT', title: 'Drink water' }),
      )
      expect(onSaved).toHaveBeenCalled()
    })
  })
})
