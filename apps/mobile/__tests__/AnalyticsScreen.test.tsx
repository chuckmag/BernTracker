import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AnalyticsScreen from '../src/screens/AnalyticsScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    useNavigation: jest.fn(),
  }
})

jest.mock('../src/components/ConsistencyCard', () => () => {
  const { Text } = require('react-native')
  return <Text>ConsistencyCard</Text>
})

jest.mock('../src/components/StrengthPRCard', () => () => {
  const { Text } = require('react-native')
  return <Text>StrengthPRCard</Text>
})

jest.mock('../src/lib/api', () => ({
  api: {
    analytics: {
      consistency: jest.fn(),
      trackedMovements: jest.fn(),
      movements: jest.fn(),
    },
  },
}))

import { useNavigation } from '@react-navigation/native'
import { api } from '../src/lib/api'

const mockConsistency = {
  currentStreak: 5,
  longestStreak: 14,
  history: [{ date: '2026-05-01', count: 1 }],
}

const emptyMovementsData = { strength: [], monostructural: [], gymnastics: [] }

const sampleMovementsData = {
  strength: [
    {
      movementId: 'mv-1',
      name: 'Back Squat',
      prTypes: ['LOAD'],
      primaryPR: { type: 'LOAD', reps: 1, load: 225, loadUnit: 'LB', achievedAt: '2026-04-01T00:00:00Z' },
      lastLoggedAt: '2026-04-01T00:00:00Z',
    },
    {
      movementId: 'mv-2',
      name: 'Deadlift',
      prTypes: ['LOAD'],
      primaryPR: null,
      lastLoggedAt: '2026-03-15T00:00:00Z',
    },
  ],
  monostructural: [
    {
      movementId: 'mv-3',
      name: 'Row',
      prTypes: ['DISTANCE'],
      primaryPR: { type: 'DISTANCE', seconds: 120, distance: 500, distanceUnit: 'M', achievedAt: '2026-03-01T00:00:00Z' },
      lastLoggedAt: '2026-03-01T00:00:00Z',
    },
  ],
  gymnastics: [],
}

function makeNavigation() {
  return { push: jest.fn(), navigate: jest.fn(), goBack: jest.fn() } as any
}

describe('AnalyticsScreen', () => {
  let navigation: ReturnType<typeof makeNavigation>

  beforeEach(() => {
    jest.clearAllMocks()
    navigation = makeNavigation()
    ;(useNavigation as jest.Mock).mockReturnValue(navigation)
    ;(api.analytics.consistency as jest.Mock).mockResolvedValue(mockConsistency)
    ;(api.analytics.trackedMovements as jest.Mock).mockResolvedValue([])
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(emptyMovementsData)
  })

  test('renders Summary, Movements, and Benchmarks tabs', async () => {
    const { getByRole } = render(<AnalyticsScreen />)
    expect(getByRole('tab', { name: 'Summary' })).toBeTruthy()
    expect(getByRole('tab', { name: 'Movements' })).toBeTruthy()
    expect(getByRole('tab', { name: 'Benchmarks' })).toBeTruthy()
  })

  test('Summary tab is selected by default', async () => {
    const { getByRole } = render(<AnalyticsScreen />)
    const summaryTab = getByRole('tab', { name: 'Summary' })
    expect(summaryTab.props.accessibilityState?.selected).toBe(true)
    const movementsTab = getByRole('tab', { name: 'Movements' })
    expect(movementsTab.props.accessibilityState?.selected).toBe(false)
  })

  test('renders ConsistencyCard after summary data loads', async () => {
    const { findByText } = render(<AnalyticsScreen />)
    expect(await findByText('ConsistencyCard')).toBeTruthy()
  })

  test('shows error when summary API fails', async () => {
    ;(api.analytics.consistency as jest.Mock).mockRejectedValue(new Error('Network failure'))
    ;(api.analytics.trackedMovements as jest.Mock).mockRejectedValue(new Error('Network failure'))
    const { findByText } = render(<AnalyticsScreen />)
    expect(await findByText('Network failure')).toBeTruthy()
  })

  test('switching to Movements tab shows empty state when no movements', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(emptyMovementsData)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    expect(await findByText('No movements logged yet')).toBeTruthy()
  })

  test('Movements tab shows movement cards grouped by category', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(sampleMovementsData)
    const { getByRole, findByText, queryByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    expect(await findByText('Strength')).toBeTruthy()
    expect(await findByText('Back Squat')).toBeTruthy()
    expect(await findByText('Deadlift')).toBeTruthy()
    expect(await findByText('Monostructural')).toBeTruthy()
    expect(await findByText('Row')).toBeTruthy()
  })

  test('Gymnastics section is hidden when it has no entries', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(sampleMovementsData)
    const { getByRole, findByText, queryByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    await findByText('Strength')
    expect(queryByText('Gymnastics')).toBeNull()
  })

  test('Movements tab shows formatted primary PR', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(sampleMovementsData)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    expect(await findByText('225 LB × 1')).toBeTruthy()
  })

  test('Movements tab shows "No PR recorded" for null primaryPR', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(sampleMovementsData)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    await findByText('Deadlift')
    expect(await findByText('No PR recorded')).toBeTruthy()
  })

  test('switching to Benchmarks tab shows placeholder text', async () => {
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    expect(await findByText('Benchmark WODs coming soon.')).toBeTruthy()
  })

  test('tapping a movement card navigates to MovementDetail', async () => {
    ;(api.analytics.movements as jest.Mock).mockResolvedValue(sampleMovementsData)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Movements' }))
    const card = await findByText('Back Squat')
    fireEvent.press(card)
    expect(navigation.push).toHaveBeenCalledWith('MovementDetail', {
      movementId: 'mv-1',
      name: 'Back Squat',
      prTypes: ['LOAD'],
    })
  })
})
