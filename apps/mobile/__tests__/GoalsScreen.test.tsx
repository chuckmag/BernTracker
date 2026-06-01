/**
 * Unit tests for GoalsScreen — the Active / Completed / Archived tabbed list.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import GoalsScreen from '../src/screens/GoalsScreen'
import type { GoalResponse } from '../src/lib/api'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    // React Navigation's real `useFocusEffect` re-runs the effect whenever
    // the callback's identity changes (callers wrap it in useCallback whose
    // deps reflect what should trigger a refetch — e.g. `tab` here). Mock
    // it with `[cb]` as deps so the test behaviour matches; an empty deps
    // array would only fire on mount and miss tab-switch refetches.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    useNavigation: () => ({ navigate: mockNavigate }),
  }
})

jest.mock('../src/lib/api', () => ({
  api: {
    users: { me: { goals: { list: jest.fn() } } },
  },
}))

jest.mock('../src/components/GoalFormModal', () => () => {
  const { Text } = require('react-native')
  return <Text>GoalFormModal</Text>
})

import { api } from '../src/lib/api'

function makeGoal(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'g1',
    userId: 'u1',
    type: 'PR_TARGET',
    status: 'ACTIVE',
    title: 'Goal',
    targetDate: null,
    movementId: 'mv1',
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
    movement: { id: 'mv1', name: 'Back Squat' },
    namedWorkout: null,
    progress: { type: 'PR_TARGET', current: 200, target: 315, unit: 'LB', percent: 63, isComplete: false },
    ...overrides,
  }
}

describe('GoalsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
  })

  test('renders Active, Completed and Archived tabs', async () => {
    const { getByRole } = render(<GoalsScreen />)
    expect(getByRole('tab', { name: 'Active' })).toBeTruthy()
    expect(getByRole('tab', { name: 'Completed' })).toBeTruthy()
    expect(getByRole('tab', { name: 'Archived' })).toBeTruthy()
  })

  test('Active tab is selected by default', async () => {
    const { getByRole } = render(<GoalsScreen />)
    const active = getByRole('tab', { name: 'Active' })
    expect(active.props.accessibilityState?.selected).toBe(true)
    const completed = getByRole('tab', { name: 'Completed' })
    expect(completed.props.accessibilityState?.selected).toBe(false)
  })

  test('switching tabs refetches with the new status', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    const { getByRole } = render(<GoalsScreen />)
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'ACTIVE' })
    })
    fireEvent.press(getByRole('tab', { name: 'Completed' }))
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'COMPLETED' })
    })
    fireEvent.press(getByRole('tab', { name: 'Archived' }))
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'ARCHIVED' })
    })
  })

  test('renders an empty state when no goals are returned', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    const { findByText } = render(<GoalsScreen />)
    expect(await findByText('No active goals')).toBeTruthy()
  })

  test('renders goal rows when results come back', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([
      makeGoal({ id: 'g1', title: 'Squat 315' }),
      makeGoal({ id: 'g2', title: 'Bench 225' }),
    ])
    const { findByText } = render(<GoalsScreen />)
    expect(await findByText('🎯 Squat 315')).toBeTruthy()
    expect(await findByText('🎯 Bench 225')).toBeTruthy()
  })

  test('FAB opens the create modal', async () => {
    const { findByLabelText, findByText, queryByText } = render(<GoalsScreen />)
    const fab = await findByLabelText('Create a new goal')
    expect(queryByText('GoalFormModal')).toBeNull()
    fireEvent.press(fab)
    expect(await findByText('GoalFormModal')).toBeTruthy()
  })

  test('tapping a goal navigates to GoalDetail', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([makeGoal({ id: 'gx', title: 'Squat 315' })])
    const { findByText } = render(<GoalsScreen />)
    const row = await findByText('🎯 Squat 315')
    fireEvent.press(row)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('GoalDetail', { goalId: 'gx' })
    })
  })
})
