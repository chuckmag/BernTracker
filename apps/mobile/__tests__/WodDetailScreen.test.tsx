/**
 * WodDetailScreen tests
 *
 * T6-display: Workout title and description rendered from the API response.
 * T7: Tapping a level filter chip re-fetches the leaderboard with that level filter.
 * T8: The current user's leaderboard row has the highlight background style applied.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import WodDetailScreen from '../src/screens/WodDetailScreen'

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
    user: { id: userId, name: userName },
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
      user: { id: 'me', email: 'me@gym.com', name: 'Me' },
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn(),
    })
    ;(api.workouts.get as jest.Mock).mockResolvedValue(WORKOUT)
    ;(api.workouts.results as jest.Mock).mockResolvedValue([])
  })

  test('T6-display: shows workout title and description from API', async () => {
    const { findByText } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')
    await findByText('21-15-9 Thrusters and Pull-ups')
  })

  test('T7: tapping the "RX" filter chip re-fetches leaderboard with level=RX', async () => {
    const { findByText } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    // Wait for initial load (called with no level filter = undefined)
    await findByText('Fran')
    expect(api.workouts.results).toHaveBeenCalledWith('workout-1', undefined)

    fireEvent.press(await findByText('RX'))

    await waitFor(() => {
      expect(api.workouts.results).toHaveBeenCalledWith('workout-1', 'RX')
    })
  })

  test('T7b: tapping "All" after a level filter clears the filter', async () => {
    const { findByText } = render(
      <WodDetailScreen navigation={makeNavigation()} route={makeRoute()} />,
    )

    await findByText('Fran')

    // Set a filter first
    fireEvent.press(await findByText('Scaled'))
    await waitFor(() => expect(api.workouts.results).toHaveBeenCalledWith('workout-1', 'SCALED'))

    // Clear it
    fireEvent.press(await findByText('All'))
    await waitFor(() => expect(api.workouts.results).toHaveBeenCalledWith('workout-1', undefined))
  })

  test('T8: current user\'s leaderboard row has highlight background color applied', async () => {
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
