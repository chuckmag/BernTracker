/**
 * Unit tests for GoalDetailScreen — covers per-type rendering, the PR Target
 * reference-line text in the SVG chart, and the Habit "Mark complete" path.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import GoalDetailScreen from '../src/screens/GoalDetailScreen'
import type { GoalResponse } from '../src/lib/api'

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
    useRoute: () => ({ params: { goalId: 'goal-1' } }),
  }
})

jest.mock('../src/lib/api', () => ({
  api: {
    goals: {
      get: jest.fn(),
      checkIns: {
        record: jest.fn(),
        remove: jest.fn(),
        list: jest.fn(() => Promise.resolve([])),
      },
    },
    users: { me: { goals: { update: jest.fn(), remove: jest.fn() } } },
    analytics: { movementTrajectory: jest.fn(() => Promise.resolve({ prType: 'LOAD', points: [] })) },
  },
}))

jest.mock('../src/components/GoalFormModal', () => () => {
  const { Text } = require('react-native')
  return <Text>GoalFormModal</Text>
})

// MovementHistorySection mounts its own data fetch on render; stubbing it
// keeps GoalDetailScreen tests focused on the goal-detail layer. The
// component has its own test suite.
jest.mock('../src/components/MovementHistorySection', () => () => {
  const { Text } = require('react-native')
  return <Text>MovementHistorySection</Text>
})

import { api } from '../src/lib/api'

function prGoal(overrides: Partial<GoalResponse> = {}): GoalResponse {
  return {
    id: 'goal-1',
    userId: 'u1',
    type: 'PR_TARGET',
    status: 'ACTIVE',
    title: 'Squat 315',
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
    progress: { type: 'PR_TARGET', current: 275, target: 315, unit: 'LB', percent: 87, isComplete: false },
    ...overrides,
  }
}

function habitGoal(overrides: { currentStreak?: number; checkedInToday?: boolean } = {}): GoalResponse {
  const currentStreak = overrides.currentStreak ?? 0
  const checkedInToday = overrides.checkedInToday ?? false
  return {
    ...prGoal(),
    type: 'HABIT',
    title: 'Stretch daily',
    progress: {
      type: 'HABIT',
      currentStreak,
      longestStreak: currentStreak,
      totalCheckIns: currentStreak,
      weekCheckIns: currentStreak,
      last7Days: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-05-${21 - i}`,
        checkedIn: i < currentStreak,
      })),
      checkedInToday,
    },
    movement: null,
    namedWorkout: null,
    movementId: null,
    targetPrType: null,
    targetValue: null,
    targetLoadUnit: null,
    targetRepCount: null,
  } as GoalResponse
}

describe('GoalDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('renders the reference-line label with the target value', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(prGoal())
    ;(api.analytics.movementTrajectory as jest.Mock).mockResolvedValue({
      prType: 'LOAD',
      points: [
        { achievedAt: '2026-01-01', value: 250, label: '250' },
        { achievedAt: '2026-03-01', value: 275, label: '275' },
      ],
    })
    // react-native-svg's <Text> renders to <RNSVGText> with the text passed
    // as `children` — RTL's findByText doesn't drill into it. Find the chart
    // via its accessibilityLabel, then walk its descendants for the SvgText
    // node whose children prop holds the reference-line label.
    const { findByLabelText } = render(<GoalDetailScreen />)
    const svg = await findByLabelText('PR target trajectory chart')
    // Flatten all descendants and search for a node whose `children` is
    // the expected label.
    function walk(node: any, acc: any[] = []): any[] {
      if (!node) return acc
      acc.push(node)
      const children = node.props?.children
      if (Array.isArray(children)) {
        children.forEach((c) => walk(c, acc))
      } else if (children && typeof children === 'object') {
        walk(children, acc)
      }
      return acc
    }
    const all = walk(svg)
    const found = all.some((n) => n.props?.children === 'Target: 315LB')
    expect(found).toBe(true)
  })

  test('renders the PR-target stat row (Current / Target / Progress)', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(prGoal())
    const { findByText } = render(<GoalDetailScreen />)
    expect(await findByText('Current')).toBeTruthy()
    expect(await findByText('275 LB')).toBeTruthy()
    expect(await findByText('315 LB')).toBeTruthy()
    expect(await findByText('87%')).toBeTruthy()
  })

  test('renders the weekly-progress chart for FREQUENCY goals', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue({
      ...prGoal(),
      type: 'FREQUENCY',
      title: '3x/wk × 4 weeks',
      movementId: null,
      targetPrType: null,
      targetValue: null,
      targetLoadUnit: null,
      targetRepCount: null,
      frequencyPerWeek: 3,
      frequencyWeeks: 4,
      progress: {
        type: 'FREQUENCY',
        workoutsLogged: 5,
        workoutsRequired: 12,
        percent: 42,
        weeksRemaining: 2,
        currentWeekCount: 2,
        isComplete: false,
      } as any,
    })
    const { findByText, findByLabelText } = render(<GoalDetailScreen />)
    expect(await findByText('Weekly progress')).toBeTruthy()
    // Same SVG-text trick as the PR Target chart — the bar chart's "Target:
    // 3/wk" annotation lives inside an <SvgText> we can only find via the
    // chart's accessibilityLabel.
    const svg = await findByLabelText('Weekly frequency chart')
    function walk(node: any, acc: any[] = []): any[] {
      if (!node) return acc
      acc.push(node)
      const children = node.props?.children
      if (Array.isArray(children)) children.forEach((c) => walk(c, acc))
      else if (children && typeof children === 'object') walk(children, acc)
      return acc
    }
    const all = walk(svg)
    const found = all.some((n) => n.props?.children === 'Target: 3/wk')
    expect(found).toBe(true)
  })

  test('renders the v2 streak hero and tap-to-check CTA for active HABIT goals', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(habitGoal({ currentStreak: 3 }))
    const { findByText } = render(<GoalDetailScreen />)
    // Streak hero copy
    expect(await findByText('CURRENT STREAK')).toBeTruthy()
    expect(await findByText('3')).toBeTruthy()
    expect(await findByText('Longest streak: 3 days')).toBeTruthy()
    // Tap CTA visible when not checked in today
    expect(await findByText('I did it today')).toBeTruthy()
    // Manual complete still available as secondary action
    expect(await findByText('Mark complete')).toBeTruthy()
  })

  test('renders Undo + Save note when checkedInToday=true', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(
      habitGoal({ currentStreak: 1, checkedInToday: true }),
    )
    const { findByText, queryByText } = render(<GoalDetailScreen />)
    expect(await findByText('Locked in for today.')).toBeTruthy()
    expect(await findByText('Undo')).toBeTruthy()
    expect(await findByText('Save note')).toBeTruthy()
    // The v1 placeholder is gone
    expect(queryByText('Daily check-ins coming soon')).toBeNull()
  })

  test('Tap "I did it today" calls record and updates progress', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(habitGoal({ currentStreak: 0 }))
    ;(api.goals.checkIns.record as jest.Mock).mockResolvedValue({
      checkIn: { id: 'c1', goalId: 'goal-1', date: '2026-05-21', note: null, createdAt: new Date().toISOString() },
      goal: habitGoal({ currentStreak: 1, checkedInToday: true }),
    })
    const { findByText } = render(<GoalDetailScreen />)
    const btn = await findByText('I did it today')
    fireEvent.press(btn)
    await waitFor(() => {
      expect(api.goals.checkIns.record).toHaveBeenCalledWith('goal-1', {})
    })
  })

  test('Mark complete still flips status to COMPLETED', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(habitGoal())
    ;(api.users.me.goals.update as jest.Mock).mockResolvedValue({
      ...habitGoal(),
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    })
    const { findByText } = render(<GoalDetailScreen />)
    const btn = await findByText('Mark complete')
    fireEvent.press(btn)
    await waitFor(() => {
      expect(api.users.me.goals.update).toHaveBeenCalledWith('goal-1', { status: 'COMPLETED' })
    })
  })
})
