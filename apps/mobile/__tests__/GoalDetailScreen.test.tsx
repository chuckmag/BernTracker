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
    goals: { get: jest.fn() },
    users: { me: { goals: { update: jest.fn(), remove: jest.fn() } } },
    analytics: { movementTrajectory: jest.fn(() => Promise.resolve({ prType: 'LOAD', points: [] })) },
  },
}))

jest.mock('../src/components/GoalFormModal', () => {
  const { Text } = require('react-native')
  // Default export is the component stub; named exports mirror the real
  // module so call sites that import constants (e.g. HABIT_V2_COPY) still
  // resolve to the right string.
  function GoalFormModalStub() { return <Text>GoalFormModal</Text> }
  return {
    __esModule: true,
    default: GoalFormModalStub,
    SMART_HINT_COPY:
      "Goals are easier to achieve when they're time-bound. Consider adding a target date — it's the T in SMART (Specific, Measurable, Achievable, Relevant, Time-bound).",
    HABIT_V2_COPY: 'Daily check-ins coming in v2.',
  }
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

function habitGoal(): GoalResponse {
  return {
    ...prGoal(),
    type: 'HABIT',
    title: 'Stretch daily',
    progress: { type: 'HABIT' } as any,
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

  test('renders the overall-progress bar for FREQUENCY goals', async () => {
    // Updated after deep-review #2: the per-week fabricated bar chart was
    // replaced with an honest overall progress bar (single fill proportional
    // to workoutsLogged / workoutsRequired). The bar still carries the
    // Logged / This-week legend below so the same surface-level info is
    // covered.
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
    // Progress bar is queryable via its accessibilityLabel.
    expect(await findByLabelText('Overall frequency progress bar')).toBeTruthy()
    // Legend row carries the actual numbers (5/12 logged, 2/3 this week).
    expect(await findByText(/Logged:/)).toBeTruthy()
    expect(await findByText(/This week:/)).toBeTruthy()
  })

  test('renders Mark complete button for active HABIT goals', async () => {
    ;(api.goals.get as jest.Mock).mockResolvedValue(habitGoal())
    const { findByText } = render(<GoalDetailScreen />)
    expect(await findByText('Mark complete')).toBeTruthy()
    // Updated copy after #9 — the v2 placeholder is now sourced from the
    // shared HABIT_V2_COPY constant ("Daily check-ins coming in v2.").
    expect(await findByText('Daily check-ins coming in v2.')).toBeTruthy()
  })

  test('Mark complete flips status to COMPLETED', async () => {
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
