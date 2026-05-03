/**
 * WodDetailScreen tests
 *
 * Covers WOD detail rendering, leaderboard level filter chips, and the current
 * user's row highlight styling.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import WodDetailScreen from '../src/screens/WodDetailScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    // Keep the cb in the dep array so screens that wrap a useCallback whose
    // identity changes (e.g. on filter change) see the effect re-run, just
    // like the real useFocusEffect would on the next focus tick.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  }
})

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    workouts: {
      get: jest.fn(),
      results: jest.fn(),
    },
  },
}))

jest.mock('../src/lib/format', () => ({
  formatResultValue: (v: { type: string; seconds?: number; cappedOut?: boolean; rounds?: number; reps?: number }) => {
    if (v.type === 'AMRAP') return `${v.rounds} rds + ${v.reps} reps`
    const s = v.seconds ?? 0
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  },
}))

import { useAuth } from '../src/context/AuthContext'
import { api } from '../src/lib/api'

const WORKOUT = {
  id: 'workout-1',
  title: 'Fran',
  description: '21-15-9 Thrusters and Pull-ups',
  type: 'FOR_TIME' as const,
  status: 'PUBLISHED' as const,
  scheduledAt: '2026-06-15T12:00:00.000Z',
  programId: 'prog-1',
}

function makeEntry(id: string, userId: string, userName: string) {
  return {
    id,
    user: { id: userId, name: userName, birthday: null },
    level: 'RX' as const,
    workoutGender: 'OPEN' as const,
    value: { type: 'FOR_TIME' as const, seconds: 210 },
    notes: null,
    createdAt: '2026-06-15T14:00:00.000Z',
  }
}

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function makeRoute(workoutId = 'workout-1') {
  return { params: { workoutId } } as any
}

describe('WodDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({
      user: { id: 'me', email: 'me@gym.com', name: 'Me', identifiedGender: null },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(WORKOUT)
    ;(api.workouts.results as jest.Mock).mockResolvedValue([])
  })

  test('shows workout title and description from API', async () => {
    const { findByText } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')
    await findByText('21-15-9 Thrusters and Pull-ups')
  })

  test('leaderboard fetch always uses the unfiltered endpoint; filtering is client-side', async () => {
    const rxEntry = { ...makeEntry('e1', 'alice', 'Alice'), level: 'RX' as const }
    const scaledEntry = { ...makeEntry('e2', 'bob', 'Bob'), level: 'SCALED' as const }
    ;(api.workouts.results as jest.Mock).mockResolvedValue([rxEntry, scaledEntry])

    const { findByText, queryByText, getByTestId } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')
    // No level filter passed — the screen pulls every entry once per focus
    // and applies the chip selection client-side.
    expect(api.workouts.results).toHaveBeenCalledWith('workout-1')
    await findByText('Alice')
    await findByText('Bob')

    fireEvent.press(getByTestId('level-chip-Scaled'))
    await waitFor(() => expect(queryByText('Alice')).toBeNull())
    await findByText('Bob')

    // No second API call — same data, just a different visible slice.
    expect((api.workouts.results as jest.Mock).mock.calls).toHaveLength(1)
  })

  test('gender chip narrows the visible leaderboard client-side', async () => {
    const womenEntry = {
      ...makeEntry('e1', 'alice', 'Alice'),
      workoutGender: 'FEMALE' as const,
    }
    const menEntry = {
      ...makeEntry('e2', 'bob', 'Bob'),
      workoutGender: 'MALE' as const,
    }
    ;(api.workouts.results as jest.Mock).mockResolvedValue([womenEntry, menEntry])

    const { findByText, queryByText, getByTestId } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Alice')
    await findByText('Bob')

    fireEvent.press(getByTestId('gender-chip-Women'))
    await waitFor(() => expect(queryByText('Bob')).toBeNull())
    await findByText('Alice')

    // Same fetch, just narrowed client-side.
    expect((api.workouts.results as jest.Mock).mock.calls).toHaveLength(1)
  })

  test('level + gender filters combine; empty-state copy reflects both', async () => {
    const rxFemale = {
      ...makeEntry('e1', 'alice', 'Alice'),
      level: 'RX' as const,
      workoutGender: 'FEMALE' as const,
    }
    const scaledMale = {
      ...makeEntry('e2', 'bob', 'Bob'),
      level: 'SCALED' as const,
      workoutGender: 'MALE' as const,
    }
    ;(api.workouts.results as jest.Mock).mockResolvedValue([rxFemale, scaledMale])

    const { findByText, queryByText, getByTestId } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Alice')

    // Filter to RX + Men → no entries match → empty-state copy lists both.
    fireEvent.press(getByTestId('level-chip-RX'))
    fireEvent.press(getByTestId('gender-chip-Men'))

    await waitFor(() => expect(queryByText('Alice')).toBeNull())
    await waitFor(() => expect(queryByText('Bob')).toBeNull())
    await findByText('No RX / Men results yet.')
  })

  test('switching the active filter to one that excludes the user keeps the result badge', async () => {
    // Logged at RX/Female; filter to RX+/Men → leaderboard list empty, but
    // the "your result" badge still derives from the unfiltered fetch and
    // stays visible (no spurious "Log Result" CTA, no 409 on retry).
    const myEntry = {
      ...makeEntry('e1', 'me', 'Me'),
      level: 'RX' as const,
      workoutGender: 'FEMALE' as const,
    }
    ;(api.workouts.results as jest.Mock).mockResolvedValue([myEntry])

    const { findByText, findByTestId, queryByText, getByTestId } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')
    await findByTestId('result-badge')

    fireEvent.press(getByTestId('level-chip-RX+'))
    fireEvent.press(getByTestId('gender-chip-Men'))

    await findByText('No RX+ / Men results yet.')
    await findByTestId('result-badge')
    expect(queryByText('Log Result')).toBeNull()
  })

  test('user keeps their result badge under a filter that excludes their level', async () => {
    // Logged at RX, filter to RX+: badge still shows the user's RX entry,
    // and the leaderboard list is empty (no RX+ entries) — the "Log Result"
    // CTA must NOT appear.
    const myRxEntry = { ...makeEntry('e1', 'me', 'Me'), level: 'RX' as const }
    ;(api.workouts.results as jest.Mock).mockResolvedValue([myRxEntry])

    const { findByText, findByTestId, queryByText } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')
    await findByTestId('result-badge')

    fireEvent.press(await findByText('RX+'))
    await waitFor(() => expect(queryByText('No RX+ results yet.')).not.toBeNull())

    // Badge still rendered, "Log Result" CTA still hidden.
    await findByTestId('result-badge')
    expect(queryByText('Log Result')).toBeNull()
  })

  test('Log Result button navigates to LogResult with workoutId', async () => {
    const navigation = makeNavigation()
    const { findByText } = render(
      <WodDetailScreen navigation={navigation} route={makeRoute()} />,
    )

    fireEvent.press(await findByText('Log Result'))
    expect(navigation.navigate).toHaveBeenCalledWith('LogResult', { workoutId: 'workout-1' })
  })

  test('tapping the user-result badge navigates to LogResult in edit mode', async () => {
    const myEntry = makeEntry('e2', 'me', 'Me')
    ;(api.workouts.results as jest.Mock).mockResolvedValue([myEntry])

    const navigation = makeNavigation()
    const { findByTestId } = render(
      <WodDetailScreen navigation={navigation} route={makeRoute()} />,
    )

    fireEvent.press(await findByTestId('result-badge'))
    expect(navigation.navigate).toHaveBeenCalledWith('LogResult', {
      workoutId: 'workout-1',
      resultId: 'e2',
      existingResult: myEntry,
    })
  })

  test("current user's leaderboard row has highlight background color applied", async () => {
    ;(api.workouts.results as jest.Mock).mockResolvedValue([
      makeEntry('e1', 'other-user', 'Alice'),
      makeEntry('e2', 'me', 'Me'),
    ])

    const { findByText, UNSAFE_getAllByType } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    // The highlight style adds backgroundColor: '#1e1b4b' to the current user's row.
    const meText = await findByText('Me')

    // Walk up the tree until we find a node with the highlight backgroundColor.
    // Fixed-depth traversal is fragile because RN host/composite split adds extra levels.
    function findAncestorWithBg(node: any, color: string): any {
      let cur = node
      while (cur) {
        const flat = StyleSheet.flatten(cur.props?.style ?? []) as Record<string, unknown>
        if (flat?.backgroundColor === color) return cur
        cur = cur.parent
      }
      return null
    }

    const highlight = '#1e1b4b'
    expect(findAncestorWithBg(meText, highlight)).not.toBeNull()
    expect(findAncestorWithBg(await findByText('Alice'), highlight)).toBeNull()
  })
})
