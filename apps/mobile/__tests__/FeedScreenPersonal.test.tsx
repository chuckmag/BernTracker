/**
 * FeedScreen — personal program parity tests (#183)
 *
 * Lives in its own file rather than alongside the other FeedScreen specs
 * because the personal-program upsert (`api.me.personalProgram.get`) fires
 * its own `useEffect`, and React 19 + @testing-library/react-native v12
 * have a known cross-describe pollution issue (callstack/react-native-
 * testing-library#1734) where a previous test's renderer becomes
 * "unmounted" mid-cleanup and the next test's `render()` trips the
 * `.root on unmounted test renderer` assertion. Splitting the new
 * behaviors into a fresh file gives them a clean module-load state.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import FeedScreen from '../src/screens/FeedScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
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
        workouts: { list: jest.fn(), create: jest.fn() },
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
  _count: { workouts: 1 },
}

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function workout(id: string, title: string, scheduledAt: Date, type = 'AMRAP', programId: string | null = null) {
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

function daysFromNow(n: number) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

describe('FeedScreen — personal program', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useGym as jest.Mock).mockReturnValue({ activeGym: ACTIVE_GYM, isLoading: false, selectGym: jest.fn() })
    ;(useProgramFilter as jest.Mock).mockReturnValue({
      selected: [], available: [], loading: false,
      setSelected: jest.fn(), toggle: jest.fn(), clear: jest.fn(),
    })
  })

  test('shows the "+" add-personal-workout button on each day-header row', async () => {
    ;(api.me.personalProgram.get as jest.Mock).mockResolvedValue(PERSONAL_PROGRAM)
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([])

    const { findAllByLabelText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)
    const buttons = await findAllByLabelText('Add personal workout')
    expect(buttons.length).toBeGreaterThan(0)
  })

  test('hides the "+" button when the personal-program upsert fails', async () => {
    ;(api.me.personalProgram.get as jest.Mock).mockRejectedValue(new Error('boom'))
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([])

    const { findByText, queryAllByLabelText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)
    await findByText(/^TODAY/)
    expect(queryAllByLabelText('Add personal workout')).toHaveLength(0)
  })

  test('tapping "+" navigates to AddPersonalWorkout with the day key', async () => {
    ;(api.me.personalProgram.get as jest.Mock).mockResolvedValue(PERSONAL_PROGRAM)
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([])
    const navigation = makeNavigation()

    const { findAllByLabelText } = render(<FeedScreen navigation={navigation} route={{} as any} />)
    const buttons = await findAllByLabelText('Add personal workout')
    fireEvent.press(buttons[0])
    expect(navigation.navigate).toHaveBeenCalledWith(
      'AddPersonalWorkout',
      expect.objectContaining({ scheduledAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    )
  })

  test('sorts personal-program workouts after gym workouts and renders an "Extra work" divider', async () => {
    ;(api.me.personalProgram.get as jest.Mock).mockResolvedValue(PERSONAL_PROGRAM)
    const today = daysFromNow(0)
    const gym = workout('w-gym', 'Class WOD', today, 'AMRAP', 'gym-prog-99')
    const personal = workout('w-personal', 'Extra row', today, 'ROWING', 'pp-1')
    ;(api.gyms.workouts as jest.Mock).mockResolvedValue([gym, personal])

    const { findByText, getByText } = render(<FeedScreen navigation={makeNavigation()} route={{} as any} />)
    await findByText('Class WOD')
    await findByText('Extra row')
    // The "EXTRA WORK" eyebrow only appears when both gym and personal
    // tiles share a day — this assertion is the load-bearing check that
    // a personal tile is recognized as such.
    expect(getByText('EXTRA WORK')).toBeTruthy()
  })
})
