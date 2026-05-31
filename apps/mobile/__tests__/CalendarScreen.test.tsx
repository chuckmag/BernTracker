/**
 * CalendarScreen tests
 *
 * Covers the 3-day strip layout, prev/next/today navigation, ProgramFilter
 * integration, and the tap targets for opening WodDetail / the editor.
 *
 * Lives in its own file rather than alongside other gym-aware specs because
 * the personal-program upsert fires its own `useEffect` on mount, and a
 * known cross-describe pollution issue in @testing-library/react-native v12
 * with React 19 (callstack/react-native-testing-library#1734) can wipe out
 * the next test's renderer otherwise. Same split pattern as
 * FeedScreenPersonal.test.tsx.
 */

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import CalendarScreen from '../src/screens/CalendarScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    // Re-fire on callback identity change so a stripStartKey/programIds
    // update (which rebuilds loadStrip → rebuilds the callback) triggers a
    // refetch — matching production React Navigation behavior. The
    // CalendarScreen wraps the callback in useCallback so the effect can't
    // loop here.
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  }
})

jest.mock('../src/context/GymContext', () => ({ useGym: jest.fn() }))
jest.mock('../src/context/ProgramFilterContext', () => ({ useProgramFilter: jest.fn() }))
jest.mock('../src/components/ProgramFilterPicker', () => () => null)

jest.mock('../src/lib/api', () => ({
  api: {
    gyms: { workouts: jest.fn() },
    me: {
      personalProgram: {
        get: jest.fn(),
      },
    },
  },
}))

import { useGym } from '../src/context/GymContext'
import { useProgramFilter } from '../src/context/ProgramFilterContext'
import { api } from '../src/lib/api'

const ACTIVE_GYM = { id: 'gym-1', name: 'Test Gym', slug: 'test-gym', timezone: 'UTC', role: 'MEMBER' }

const PERSONAL_PROGRAM = {
  id: 'pp-1',
  name: 'Personal Program',
  description: null,
  visibility: 'PRIVATE',
  coverColor: null,
  ownerUserId: 'u-1',
  _count: { workouts: 0 },
}

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function workout(id: string, title: string, scheduledAt: Date, type = 'AMRAP', programId = 'prog-1') {
  return {
    id,
    title,
    type,
    status: 'PUBLISHED',
    scheduledAt: scheduledAt.toISOString(),
    programId,
    description: '',
  }
}

function isoMidnight(offsetDays: number) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d
}

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('CalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: ACTIVE_GYM, isLoading: false, selectGym: jest.fn() })
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: [], available: [], loading: false,
      setSelected: jest.fn(), toggle: jest.fn(), clear: jest.fn(),
    })
    ;(api.me.personalProgram.get as jest.Mock).mockResolvedValue(PERSONAL_PROGRAM)
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([])
  })

  test('renders 3 day columns starting today (the strip is today + next 2 days)', async () => {
    const { findByTestId } = render(<CalendarScreen navigation={makeNavigation()} route={{} as any} />)
    const today = new Date()
    const day0 = toDateKey(today)
    const day1 = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))
    const day2 = toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2))
    await findByTestId(`calendar-day-${day0}`)
    await findByTestId(`calendar-day-${day1}`)
    await findByTestId(`calendar-day-${day2}`)
  })

  test('fetches the strip window from /api/gyms/:id/workouts and passes programIds through', async () => {
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: ['prog-a', 'prog-b'], available: [], loading: false,
      setSelected: jest.fn(), toggle: jest.fn(), clear: jest.fn(),
    })
    render(<CalendarScreen navigation={makeNavigation()} route={{} as any} />)
    await waitFor(() => expect(api.gyms.workouts).toHaveBeenCalled())
    const args = (api.gyms.workouts as jest.Mock).mock.calls[0]
    expect(args[0]).toBe('gym-1')
    expect(args[3]).toEqual(['prog-a', 'prog-b'])
  })

  test('strip window bounds are UTC-midnight aligned (regression guard)', async () => {
    // Server stores `scheduledAt` at UTC moments tied to the calendar date;
    // converting local-midnight to ISO would shift the lower bound past
    // 00:00Z for any viewer west of UTC and drop the first day's workouts.
    render(<CalendarScreen navigation={makeNavigation()} route={{} as any} />)
    await waitFor(() => expect(api.gyms.workouts).toHaveBeenCalled())
    const [, from, to] = (api.gyms.workouts as jest.Mock).mock.calls[0]
    const fromDate = new Date(from)
    const toDate = new Date(to)
    // `from` is exactly UTC midnight (HH:MM:SS:ms all zero).
    expect(fromDate.getUTCHours()).toBe(0)
    expect(fromDate.getUTCMinutes()).toBe(0)
    expect(fromDate.getUTCSeconds()).toBe(0)
    expect(fromDate.getUTCMilliseconds()).toBe(0)
    // `to` is the last UTC millisecond of the 3rd day → 2 days + 23:59:59.999 from `from`.
    const spanMs = toDate.getTime() - fromDate.getTime()
    expect(spanMs).toBe(2 * 86400000 + (23 * 3600 + 59 * 60 + 59) * 1000 + 999)
  })

  test('empty program selection passes undefined for programIds (the "all programs" contract)', async () => {
    render(<CalendarScreen navigation={makeNavigation()} route={{} as any} />)
    await waitFor(() => expect(api.gyms.workouts).toHaveBeenCalled())
    expect((api.gyms.workouts as jest.Mock).mock.calls[0][3]).toBeUndefined()
  })

  test('tapping the "+" on a day navigates to WorkoutEditor in create mode with the day key', async () => {
    const navigation = makeNavigation()
    const { findAllByLabelText } = render(<CalendarScreen navigation={navigation} route={{} as any} />)
    const adds = await findAllByLabelText(/Add workout on \d{4}-\d{2}-\d{2}/)
    expect(adds.length).toBe(3)
    fireEvent.press(adds[0])
    expect(navigation.navigate).toHaveBeenCalledWith(
      'WorkoutEditor',
      expect.objectContaining({ mode: 'create', scheduledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
  })

  test('tapping a workout pill navigates to WodDetail with the workoutId', async () => {
    const today = isoMidnight(0)
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([
      workout('w-today', 'Strength Day', today, 'STRENGTH'),
    ])
    const navigation = makeNavigation()
    const { findByText } = render(<CalendarScreen navigation={navigation} route={{} as any} />)
    fireEvent.press(await findByText('Strength Day'))
    expect(navigation.navigate).toHaveBeenCalledWith('WodDetail', { workoutId: 'w-today' })
  })

  test('Today jump button only renders when today is outside the visible window; pressing it returns', async () => {
    const navigation = makeNavigation()
    const { queryByTestId, findByTestId, getByTestId } = render(
      <CalendarScreen navigation={navigation} route={{} as any} />,
    )
    // Initially today is in the window — no Today button.
    await findByTestId('strip-next')
    expect(queryByTestId('strip-today')).toBeNull()
    // Page forward → today is out of window → Today button appears.
    await act(async () => { fireEvent.press(getByTestId('strip-next')) })
    await findByTestId('strip-today')
    // Press Today → button disappears again.
    await act(async () => { fireEvent.press(getByTestId('strip-today')) })
    await waitFor(() => expect(queryByTestId('strip-today')).toBeNull())
  })

  test('prev/next shift the window by 3 days and refetch the new range', async () => {
    const { getByTestId, findByTestId } = render(<CalendarScreen navigation={makeNavigation()} route={{} as any} />)
    await findByTestId('strip-next')
    const initialCalls = (api.gyms.workouts as jest.Mock).mock.calls.length
    await act(async () => { fireEvent.press(getByTestId('strip-next')) })
    await waitFor(() => {
      expect((api.gyms.workouts as jest.Mock).mock.calls.length).toBeGreaterThan(initialCalls)
    })
    // Latest call's `from` should be 3 days after today.
    const calls = (api.gyms.workouts as jest.Mock).mock.calls
    const [, secondFrom] = calls[calls.length - 1]
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.round((new Date(secondFrom).getTime() - today.getTime()) / 86400000)
    expect(diffDays).toBeGreaterThanOrEqual(2)
    expect(diffDays).toBeLessThanOrEqual(4)
  })

  test('hides the "+" affordance if the personal-program upsert fails (caller has nowhere to write to)', async () => {
    ;(api.me.personalProgram.get as jest.Mock).mockRejectedValue(new Error('boom'))
    const { findByTestId, queryByLabelText } = render(
      <CalendarScreen navigation={makeNavigation()} route={{} as any} />,
    )
    await findByTestId('strip-next')
    await waitFor(() => {
      expect(queryByLabelText(/Add workout on \d{4}-\d{2}-\d{2}/)).toBeNull()
    })
  })
})
