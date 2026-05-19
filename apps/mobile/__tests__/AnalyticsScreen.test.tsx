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
    benchmarks: {
      list: jest.fn(),
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

const sampleBenchmarks = [
  {
    id: 'nw-1',
    name: 'Fran',
    category: 'GIRL_WOD',
    aliases: [],
    isActive: true,
    description: '21-15-9: Thrusters, Pull-ups',
    sourceUrl: null,
    templateWorkout: { id: 'tw-1', type: 'FOR_TIME', description: '21-15-9 Thrusters, Pull-ups', workoutMovements: [] },
    manualResultCount: 3,
    latestResult: {
      id: 'r-1',
      userId: 'u1',
      namedWorkoutName: 'Fran',
      achievedAt: '2026-03-01T00:00:00Z',
      level: 'RX',
      workoutGender: 'MALE',
      value: {},
      notes: null,
      primaryScoreKind: 'TIME',
      primaryScoreValue: 183,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
  },
  {
    id: 'nw-2',
    name: 'Grace',
    category: 'GIRL_WOD',
    aliases: [],
    isActive: true,
    description: '30 Clean & Jerks for time',
    sourceUrl: null,
    templateWorkout: null,
    manualResultCount: 0,
    latestResult: null,
  },
  {
    id: 'nw-3',
    name: 'Murph',
    category: 'HERO_WOD',
    aliases: [],
    isActive: true,
    description: '1 mile, 100 pull-ups, 200 push-ups, 300 squats, 1 mile',
    sourceUrl: null,
    templateWorkout: null,
    manualResultCount: 1,
    latestResult: {
      id: 'r-3',
      userId: 'u1',
      namedWorkoutName: 'Murph',
      achievedAt: '2026-05-01T00:00:00Z',
      level: 'SCALED',
      workoutGender: 'MALE',
      value: {},
      notes: null,
      primaryScoreKind: 'TIME',
      primaryScoreValue: 2460,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
  },
]

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
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue([])
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
    const { getByRole, findByText } = render(<AnalyticsScreen />)
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

  // ── Benchmarks tab ──────────────────────────────────────────────────────────

  test('Benchmarks tab shows empty state when API returns no benchmarks', async () => {
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue([])
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    expect(await findByText('No benchmarks available')).toBeTruthy()
  })

  test('Benchmarks tab shows error when API fails', async () => {
    ;(api.benchmarks.list as jest.Mock).mockRejectedValue(new Error('API down'))
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    expect(await findByText('API down')).toBeTruthy()
  })

  test('Benchmarks tab groups WODs under category headings', async () => {
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue(sampleBenchmarks)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    expect(await findByText('Girls')).toBeTruthy()
    expect(await findByText('Heroes')).toBeTruthy()
    expect(await findByText('Fran')).toBeTruthy()
    expect(await findByText('Grace')).toBeTruthy()
    expect(await findByText('Murph')).toBeTruthy()
  })

  test('Benchmarks tab shows formatted TIME score for attempted WODs', async () => {
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue(sampleBenchmarks)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    // Fran: 183s = 3:03
    expect(await findByText('3:03')).toBeTruthy()
  })

  test('Benchmarks tab shows "Not attempted" for WODs with no results', async () => {
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue(sampleBenchmarks)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    await findByText('Fran')
    expect(await findByText('Not attempted')).toBeTruthy()
  })

  test('tapping a benchmark card navigates to BenchmarkDetail', async () => {
    ;(api.benchmarks.list as jest.Mock).mockResolvedValue(sampleBenchmarks)
    const { getByRole, findByText } = render(<AnalyticsScreen />)
    fireEvent.press(getByRole('tab', { name: 'Benchmarks' }))
    const card = await findByText('Fran')
    fireEvent.press(card)
    expect(navigation.push).toHaveBeenCalledWith('BenchmarkDetail', {
      entry: sampleBenchmarks[0],
    })
  })
})
