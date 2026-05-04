/**
 * FeedScreen tests
 *
 * Covers the backward-paginating infinite scroll: today-first day blocks,
 * empty-day placeholders, multi-workout days, navigation, pull-to-refresh,
 * and onEndReached fetching the next older page.
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { FlatList, RefreshControl } from 'react-native'
import FeedScreen from '../src/screens/FeedScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
  }
})

jest.mock('../src/context/GymContext', () => ({
  useGym: jest.fn(),
}))

jest.mock('../src/context/ProgramFilterContext', () => ({
  useProgramFilter: jest.fn(),
}))

jest.mock('../src/components/ProgramFilterPicker', () => () => null)

jest.mock('../src/lib/api', () => ({
  api: {
    gyms: { workouts: jest.fn() },
    me: {
      personalProgram: {
        get: jest.fn(),
        workouts: { list: jest.fn(), create: jest.fn() },
      },
    },
  },
}))

import { useGym } from '../src/context/GymContext'
import { useProgramFilter } from '../src/context/ProgramFilterContext'
import { api } from '../src/lib/api'

const ACTIVE_GYM = { id: 'gym-1', name: 'Test Gym', slug: 'test-gym', timezone: 'UTC', role: 'MEMBER' }

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function workout(id: string, title: string, scheduledAt: Date, type = 'AMRAP') {
  return {
    id,
    title,
    type,
    status: 'PUBLISHED',
    scheduledAt: scheduledAt.toISOString(),
    programId: 'prog-1',
    description: '',
  }
}

function daysFromNow(n: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

describe('FeedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Default the personal-program upsert to a never-resolving promise so
    // existing specs (which don't care about the add affordance) render
    // exactly the same as before — and so the .then/.catch handlers never
    // fire, which avoids leaking a setState into an unmounted renderer
    // between tests. The personal-program-specific specs override this
    // with a resolved row in their own beforeEach.
    ;(api.me.personalProgram.get as jest.Mock).mockReturnValue(new Promise(() => {}))
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: ACTIVE_GYM, isLoading: false, selectGym: jest.fn() })
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: [],
      available: [],
      loading: false,
      setSelected: jest.fn(),
      toggle: jest.fn(),
      clear: jest.fn(),
    })
  })

  test('initial load fetches today + previous 29 days, with today as the newest block', async () => {
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'Today WOD', daysFromNow(0)),
      workout('w2', 'Yesterday WOD', daysFromNow(-1)),
    ])

    const { findByText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)

    await findByText(/^TODAY/)
    await findByText(/^YESTERDAY/)
    await findByText('Today WOD')
    await findByText('Yesterday WOD')
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
    expect(getAllByText(/^TODAY/)).toHaveLength(1)
  })

  test('days without workouts render a "No workouts planned" placeholder', async () => {
    // No workouts come back from the API at all; every day in the 30-day
    // window should still render with the empty placeholder.
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([])

    const { findByText, findAllByText } = render(
      <FeedScreen navigation={makeNavigation()} route={{} as any} />,
    )

    await findByText(/^TODAY/)
    const placeholders = await findAllByText('No workouts planned')
    expect(placeholders.length).toBeGreaterThan(0)
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

    await findByText('Daily WOD')
    expect(api.gyms.workouts).toHaveBeenCalledTimes(1)

    const rc = UNSAFE_getByType(RefreshControl)
    act(() => rc.props.onRefresh())

    await waitFor(() => {
      expect(api.gyms.workouts).toHaveBeenCalledTimes(2)
    })
  })

  test('passes selected programIds to api.gyms.workouts; empty selection sends none', async () => {
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: ['prog-a', 'prog-b'],
      available: [],
      loading: false,
      setSelected: jest.fn(),
      toggle: jest.fn(),
      clear: jest.fn(),
    })
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'Filtered WOD', daysFromNow(0)),
    ])

    const { findByText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)
    await findByText('Filtered WOD')

    const args = (api.gyms.workouts as jest.Mock).mock.calls[0]
    expect(args[0]).toBe('gym-1')
    expect(args[3]).toEqual(['prog-a', 'prog-b'])
  })

  test('empty selection passes undefined for programIds (the "all programs" contract)', async () => {
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w1', 'All WOD', daysFromNow(0)),
    ])

    const { findByText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)
    await findByText('All WOD')

    const args = (api.gyms.workouts as jest.Mock).mock.calls[0]
    expect(args[3]).toBeUndefined()
  })

  test('onEndReached fetches the next older page with the prior 30-day window', async () => {
    ;(api.gyms.workouts as jest.Mock)
      .mockResolvedValueOnce([workout('w1', 'Today WOD', daysFromNow(0))])
      .mockResolvedValueOnce([])

    const { UNSAFE_getByType, findByText } = render(
      <FeedScreen navigation={makeNavigation()} route={{} as any} />,
    )

    await findByText('Today WOD')
    expect(api.gyms.workouts).toHaveBeenCalledTimes(1)

    const list = UNSAFE_getByType(FlatList)
    act(() => list.props.onEndReached())

    await waitFor(() => {
      expect(api.gyms.workouts).toHaveBeenCalledTimes(2)
    })

    // Second call should target the 30-day window immediately preceding the
    // initial window (the initial load covered today−29..today; the next
    // page covers today−59..today−30).
    const [, secondFrom, secondTo] = (api.gyms.workouts as jest.Mock).mock.calls[1]
    const dayMs = 86400000
    const fromAge = Math.round((Date.now() - new Date(secondFrom).getTime()) / dayMs)
    const toAge = Math.round((Date.now() - new Date(secondTo).getTime()) / dayMs)
    expect(fromAge).toBeGreaterThanOrEqual(58)
    expect(fromAge).toBeLessThanOrEqual(60)
    expect(toAge).toBeGreaterThanOrEqual(28)
    expect(toAge).toBeLessThanOrEqual(31)
  })
})


