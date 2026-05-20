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

  test('hides the SMART hint when editing a goal that already has a target date', async () => {
    const { queryByText } = render(
      <GoalFormModal
        mode="edit"
        initialGoal={makeGoal({ targetDate: '2026-12-31T00:00:00.000Z' })}
        onCancel={noop}
        onSaved={noop}
      />,
    )
    // We can't easily clear the iOS picker programmatically here, so the
    // hint should not appear on initial render when targetDate is non-null.
    expect(queryByText(SMART_HINT_COPY)).toBeNull()
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
