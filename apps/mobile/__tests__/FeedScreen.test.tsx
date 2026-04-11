/**
 * FeedScreen tests
 *
 * Covers feed data presentation: day-block grouping labels, multi-workout days,
 * card tap navigation to WodDetail, and pull-to-refresh reloading.
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { FlatList, RefreshControl } from 'react-native'
import FeedScreen from '../src/screens/FeedScreen'

// Replace useFocusEffect with a plain useEffect so screens focus immediately in tests.
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  }
})

jest.mock('../src/context/GymContext', () => ({
  useGym: jest.fn(),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    gyms: { workouts: jest.fn() },
  },
}))

import { useGym } from '../src/context/GymContext'
import { api } from '../src/lib/api'

const ACTIVE_GYM = { id: 'gym-1', name: 'Test Gym', slug: 'test-gym', timezone: 'UTC', userRole: 'MEMBER' }

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function workout(
  id: string,
  title: string,
  scheduledAt: Date,
  type = 'AMRAP',
) {
  return { id, title, type, status: 'PUBLISHED', scheduledAt: scheduledAt.toISOString(), programId: 'prog-1', description: '' }
}

function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

describe('FeedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: ACTIVE_GYM, isLoading: false, selectGym: jest.fn() })
  })

  test('workouts grouped into TODAY, TOMORROW, and future date headers', async () => {
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'Morning WOD', daysFromNow(0)),
      workout('w2', 'Tomorrow WOD', daysFromNow(1)),
      workout('w3', 'Future WOD', daysFromNow(2)),
    ])

    const { findByText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)

    await findByText(/^TODAY/)
    await findByText(/^TOMORROW/)
    // The day-after header is a localised date string in uppercase — just assert the workout renders
    await findByText('Future WOD')
  })

  test('multiple workouts on the same day appear as separate cards under one header', async () => {
    const today = daysFromNow(0)
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'Morning WOD', today, 'WARMUP'),
      workout('w2', 'Afternoon WOD', today, 'AMRAP'),
    ])

    const { findByText, getAllByText } = render(
      <FeedScreen navigation={makeNavigation()} route={{} as any} />,
    )

    await findByText('Morning WOD')
    await findByText('Afternoon WOD')

    // Only one TODAY header — both cards are under the same day block
    const todayHeaders = getAllByText(/^TODAY/)
    expect(todayHeaders).toHaveLength(1)
  })

  test('tapping a workout card calls navigate with the correct workoutId', async () => {
    const nav = makeNavigation()
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('workout-abc', 'Tap Me WOD', daysFromNow(0)),
    ])

    const { findByText } = render(<FeedScreen navigation={nav} route={{} as any} />)

    fireEvent.press(await findByText('Tap Me WOD'))

    expect(nav.navigate).toHaveBeenCalledWith('WodDetail', { workoutId: 'workout-abc' })
  })

  test('pull-to-refresh triggers a second api call', async () => {
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'Daily WOD', daysFromNow(0)),
    ])

    const { UNSAFE_getByType, findByText } = render(
      <FeedScreen navigation={makeNavigation()} route={{} as any} />,
    )

    // Wait for initial load
    await findByText('Daily WOD')
    expect(api.gyms.workouts).toHaveBeenCalledTimes(1)

    // Trigger pull-to-refresh by calling onRefresh on the RefreshControl directly
    const rc = UNSAFE_getByType(RefreshControl)
    act(() => rc.props.onRefresh())

    await waitFor(() => {
      expect(api.gyms.workouts).toHaveBeenCalledTimes(2)
    })
  })
})
