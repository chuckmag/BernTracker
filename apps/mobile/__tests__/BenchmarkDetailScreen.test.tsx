import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import BenchmarkDetailScreen from '../src/screens/BenchmarkDetailScreen'

jest.mock('react-native-svg', () => {
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
    Polyline: () => null,
    Circle: () => null,
    Line: () => null,
    Text: () => null,
  }
})

jest.mock('../src/lib/api', () => ({
  api: {
    benchmarks: {
      history: jest.fn(),
      logResult: jest.fn(),
      deleteResult: jest.fn(),
    },
  },
}))

jest.mock('../src/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      screenBg: '#030712',
      cardBg: '#111827',
      inputBg: '#1f2937',
      textPrimary: '#ffffff',
      textSecondary: '#d1d5db',
      textTertiary: '#9ca3af',
      textLabel: '#9ca3af',
      textPlaceholder: '#6b7280',
      borderSubtle: '#1f2937',
      borderInteractive: '#374151',
      accent: '#5FD4D0',
      primary: '#5B9BE6',
      accentText: '#020617',
    },
    isDark: true,
  }),
}))

import { api } from '../src/lib/api'

const sampleEntry = {
  id: 'nw-1',
  name: 'Fran',
  category: 'GIRL_WOD' as const,
  aliases: [],
  isActive: true,
  description: '21-15-9: Thrusters, Pull-ups',
  sourceUrl: null,
  templateWorkout: {
    id: 'tw-1',
    type: 'FOR_TIME',
    description: '21-15-9 Thrusters (95/65lb), Pull-ups',
    workoutMovements: [],
  },
  manualResultCount: 1,
  latestResult: {
    id: 'r-1',
    userId: 'u1',
    namedWorkoutName: 'Fran',
    achievedAt: '2026-03-01T00:00:00Z',
    level: 'RX' as const,
    workoutGender: 'MALE' as const,
    value: {},
    notes: null,
    primaryScoreKind: 'TIME',
    primaryScoreValue: 183,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
}

const sampleHistory = {
  namedWorkout: sampleEntry,
  history: [
    {
      source: 'manual' as const,
      id: 'r-1',
      achievedAt: '2026-03-01T00:00:00Z',
      level: 'RX' as const,
      workoutGender: 'MALE' as const,
      value: {},
      notes: null,
      primaryScoreKind: 'TIME',
      primaryScoreValue: 183,
      createdAt: '2026-03-01T00:00:00Z',
    },
    {
      source: 'manual' as const,
      id: 'r-2',
      achievedAt: '2026-01-15T00:00:00Z',
      level: 'SCALED' as const,
      workoutGender: 'MALE' as const,
      value: {},
      notes: 'First attempt',
      primaryScoreKind: 'TIME',
      primaryScoreValue: 270,
      createdAt: '2026-01-15T00:00:00Z',
    },
  ],
}

function makeRoute(entry = sampleEntry) {
  return { params: { entry } } as any
}

function makeNavigation() {
  return { push: jest.fn(), goBack: jest.fn() } as any
}

describe('BenchmarkDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(api.benchmarks.history as jest.Mock).mockResolvedValue(sampleHistory)
  })

  test('renders workout name and template description', async () => {
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    expect(await findByText('Fran')).toBeTruthy()
    expect(await findByText('21-15-9 Thrusters (95/65lb), Pull-ups')).toBeTruthy()
  })

  test('renders category pill and workout type label in the header', async () => {
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    expect(await findByText('Girl WOD')).toBeTruthy()
    expect(await findByText(/FOR TIME/)).toBeTruthy()
  })

  test('renders the Description and Movements section labels with chips', async () => {
    const entryWithMovements = {
      ...sampleEntry,
      templateWorkout: {
        ...sampleEntry.templateWorkout,
        workoutMovements: [
          { movement: { id: 'mv-1', name: 'Thruster', parentId: null, aliases: [] } },
          { movement: { id: 'mv-2', name: 'Pull-up', parentId: null, aliases: [] } },
        ],
      },
    }
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute(entryWithMovements as any)} navigation={makeNavigation()} />,
    )
    expect(await findByText('Description')).toBeTruthy()
    expect(await findByText('Movements')).toBeTruthy()
    expect(await findByText('Thruster')).toBeTruthy()
    expect(await findByText('Pull-up')).toBeTruthy()
  })

  test('shows best score from history', async () => {
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    // 183s = 3:03
    expect(await findByText('Best: 3:03')).toBeTruthy()
  })

  test('renders history rows with date and score', async () => {
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    expect(await findByText('3:03')).toBeTruthy()
    expect(await findByText('4:30')).toBeTruthy() // 270s
    expect(await findByText('First attempt')).toBeTruthy()
  })

  test('Best score is the fastest TIME, not the most recent (regression — was showing latest)', async () => {
    // Latest result (by date) is the SLOWEST time. The Best label must surface the fastest time.
    const heroHistory = {
      namedWorkout: { ...sampleEntry, templateWorkout: null },
      history: [
        // Most recent — slowest (52:00 = 3120 sec)
        { source: 'manual' as const, id: 'h-3', achievedAt: '2026-05-10T00:00:00Z', level: 'RX' as const, workoutGender: 'MALE' as const, value: {}, notes: null, primaryScoreKind: 'TIME', primaryScoreValue: 3120, createdAt: '2026-05-10T00:00:00Z' },
        // Middle — fastest (44:00 = 2640 sec)
        { source: 'manual' as const, id: 'h-2', achievedAt: '2026-03-15T00:00:00Z', level: 'RX' as const, workoutGender: 'MALE' as const, value: {}, notes: null, primaryScoreKind: 'TIME', primaryScoreValue: 2640, createdAt: '2026-03-15T00:00:00Z' },
        // Oldest — middle (48:00 = 2880 sec)
        { source: 'manual' as const, id: 'h-1', achievedAt: '2026-01-15T00:00:00Z', level: 'SCALED' as const, workoutGender: 'MALE' as const, value: {}, notes: null, primaryScoreKind: 'TIME', primaryScoreValue: 2880, createdAt: '2026-01-15T00:00:00Z' },
      ],
    }
    ;(api.benchmarks.history as jest.Mock).mockResolvedValue(heroHistory)
    const heroEntry = { ...sampleEntry, name: 'Murph', category: 'HERO_WOD' as const, templateWorkout: null }

    const { findByText, queryByText } = render(
      <BenchmarkDetailScreen route={makeRoute(heroEntry as any)} navigation={makeNavigation()} />,
    )

    expect(await findByText('Best: 44:00')).toBeTruthy()
    expect(queryByText('Best: 52:00')).toBeNull()
  })

  test('History rows render TIME scores even when templateWorkout is null (regression — was rendering "—")', async () => {
    const heroHistory = {
      namedWorkout: { ...sampleEntry, templateWorkout: null },
      history: [
        { source: 'manual' as const, id: 'h-1', achievedAt: '2026-03-15T00:00:00Z', level: 'RX' as const, workoutGender: 'MALE' as const, value: {}, notes: null, primaryScoreKind: 'TIME', primaryScoreValue: 2640, createdAt: '2026-03-15T00:00:00Z' },
        { source: 'manual' as const, id: 'h-2', achievedAt: '2026-01-15T00:00:00Z', level: 'RX' as const, workoutGender: 'MALE' as const, value: {}, notes: null, primaryScoreKind: 'TIME', primaryScoreValue: 3120, createdAt: '2026-01-15T00:00:00Z' },
      ],
    }
    ;(api.benchmarks.history as jest.Mock).mockResolvedValue(heroHistory)
    const heroEntry = { ...sampleEntry, name: 'Murph', category: 'HERO_WOD' as const, templateWorkout: null }

    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute(heroEntry as any)} navigation={makeNavigation()} />,
    )

    expect(await findByText('44:00')).toBeTruthy()
    expect(await findByText('52:00')).toBeTruthy()
  })

  test('shows empty state when history is empty', async () => {
    ;(api.benchmarks.history as jest.Mock).mockResolvedValue({ namedWorkout: sampleEntry, history: [] })
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    expect(await findByText('No results yet. Tap + Add to log one.')).toBeTruthy()
  })

  test('shows error when API fails', async () => {
    ;(api.benchmarks.history as jest.Mock).mockRejectedValue(new Error('Server error'))
    const { findByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    expect(await findByText('Server error')).toBeTruthy()
  })

  test('Add button opens the result modal', async () => {
    const { findByText, getByRole } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    await findByText('Fran')
    fireEvent.press(getByRole('button', { name: 'Add result' }))
    expect(await findByText('Add Result')).toBeTruthy()
  })

  test('Cancel closes the modal', async () => {
    const { findByText, getByRole, queryByText } = render(
      <BenchmarkDetailScreen route={makeRoute()} navigation={makeNavigation()} />,
    )
    await findByText('Fran')
    fireEvent.press(getByRole('button', { name: 'Add result' }))
    const cancelBtn = await findByText('Cancel')
    fireEvent.press(cancelBtn)
    await waitFor(() => expect(queryByText('Add Result')).toBeNull())
  })
})
