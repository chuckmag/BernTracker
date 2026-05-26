/**
 * Unit tests for GoalsCard — home dashboard card surfacing the user's three
 * top active goals.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import GoalsCard from '../src/components/GoalsCard'
import type { GoalResponse } from '../src/lib/api'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    useNavigation: () => ({ navigate: mockNavigate }),
  }
})

jest.mock('../src/lib/api', () => ({
  api: {
    users: { me: { goals: { list: jest.fn() } } },
  },
}))

// The form modal opens an in-flight Modal — stub it to a plain marker so the
// card tests stay focused on the card itself.
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
    title: 'Squat 315',
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
    progress: {
      type: 'PR_TARGET',
      current: 275,
      target: 315,
      unit: 'LB',
      percent: 87,
      isComplete: false,
    },
    ...overrides,
  }
}

describe('GoalsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders empty state when no active goals', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    const { findByText } = render(<GoalsCard />)
    expect(await findByText('No active goals yet')).toBeTruthy()
  })

  test('renders up to three active goals with title and progress label', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([
      makeGoal({ id: 'g1', title: 'Squat 315' }),
      makeGoal({ id: 'g2', title: 'Deadlift 405' }),
      makeGoal({ id: 'g3', title: 'Bench 225' }),
      makeGoal({ id: 'g4', title: 'Press 135' }),
    ])
    const { findByText, queryByText, findAllByText } = render(<GoalsCard />)
    expect(await findByText('Squat 315')).toBeTruthy()
    expect(await findByText('Deadlift 405')).toBeTruthy()
    expect(await findByText('Bench 225')).toBeTruthy()
    // Fourth goal must not be visible — limit 3.
    expect(queryByText('Press 135')).toBeNull()
    // Numeric progress label "275 / 315 LB" — same for all three rows.
    const labels = await findAllByText('275 / 315 LB')
    expect(labels).toHaveLength(3)
  })

  test('navigates to GoalDetail when a goal row is tapped', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([
      makeGoal({ id: 'gx', title: 'Squat 315' }),
    ])
    const { findByText } = render(<GoalsCard />)
    const row = await findByText('Squat 315')
    fireEvent.press(row)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('GoalDetail', { goalId: 'gx' })
    })
  })

  test('navigates to the Goals screen when "View all" is tapped', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    const { findByText } = render(<GoalsCard />)
    const link = await findByText('View all')
    fireEvent.press(link)
    expect(mockNavigate).toHaveBeenCalledWith('Goals')
  })

  test('"+ New goal" opens the create modal', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    const { findByText, queryByText } = render(<GoalsCard />)
    const newBtn = await findByText('+ New goal')
    expect(queryByText('GoalFormModal')).toBeNull()
    fireEvent.press(newBtn)
    expect(await findByText('GoalFormModal')).toBeTruthy()
  })

  test('only fetches goals with status=ACTIVE', async () => {
    ;(api.users.me.goals.list as jest.Mock).mockResolvedValue([])
    render(<GoalsCard />)
    await waitFor(() => {
      expect(api.users.me.goals.list).toHaveBeenCalledWith({ status: 'ACTIVE' })
    })
  })
})
