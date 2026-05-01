/**
 * HistoryScreen tests
 *
 * Covers month-block grouping, formatting, empty state, navigation,
 * pagination, and the `pages` (not `totalPages`) field name from the API.
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import HistoryScreen from '../src/screens/HistoryScreen'

jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    useNavigation: jest.fn(),
  }
})

jest.mock('../src/lib/api', () => ({
  api: {
    me: {
      results: jest.fn(),
    },
  },
}))

import { useNavigation } from '@react-navigation/native'
import { api } from '../src/lib/api'

function makeResult(id: string, scheduledAt: string, type: 'AMRAP' | 'FOR_TIME', value: any) {
  return {
    id,
    workout: { id: `w-${id}`, title: `Workout ${id}`, type, scheduledAt },
    level: 'RX' as const,
    workoutGender: 'OPEN' as const,
    value,
    notes: null,
    createdAt: scheduledAt,
  }
}

function makeNavigation() {
  return { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() } as any
}

function emptyResponse() {
  return { results: [], total: 0, page: 1, limit: 20, pages: 0 }
}

describe('HistoryScreen', () => {
  let navigation: ReturnType<typeof makeNavigation>

  beforeEach(() => {
    jest.clearAllMocks()
    navigation = makeNavigation()
    ;(useNavigation as jest.Mock).mockReturnValue(navigation)
  })

  test('renders empty state when there are no results', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue(emptyResponse())

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)

    await findByText('No results yet.')
    await findByText(/Log your first result/)
  })

  test('groups results into month blocks ordered by occurrence', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        makeResult('1', '2026-04-15T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 5, reps: 12, cappedOut: false }, movementResults: [] }),
        makeResult('2', '2026-04-02T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 4, reps: 0, cappedOut: false }, movementResults: [] }),
        makeResult('3', '2026-03-22T12:00:00.000Z', 'FOR_TIME', { score: { kind: 'TIME', seconds: 525, cappedOut: false }, movementResults: [] }),
      ],
      total: 3,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)

    await findByText('APRIL 2026')
    await findByText('MARCH 2026')
  })

  test('formats AMRAP as "X rds + Y reps" and FOR_TIME as "M:SS"', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        makeResult('1', '2026-04-15T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 3, reps: 12, cappedOut: false }, movementResults: [] }),
        makeResult('2', '2026-04-15T12:00:00.000Z', 'FOR_TIME', { score: { kind: 'TIME', seconds: 525, cappedOut: false }, movementResults: [] }),
      ],
      total: 2,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)
    await findByText('3 rds + 12 reps')
    await findByText('8:45')
  })

  test('strength results render heaviest set as "{reps} x {load} {unit}"', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        {
          id: '1',
          workout: { id: 'w-1', title: 'Back Squat 5x5', type: 'POWER_LIFTING', scheduledAt: '2026-04-15T12:00:00.000Z' },
          level: 'RX' as const,
          workoutGender: 'MALE' as const,
          value: {
            movementResults: [{
              workoutMovementId: 'm-1',
              loadUnit: 'LB',
              sets: [
                { reps: '5', load: 225 },
                // Heaviest single set — 6 x 255 lb. Ties on load break by
                // maxRepChunk(reps), so a 5-rep set still beats a 1-rep set
                // at the same load.
                { reps: '6', load: 255 },
                { reps: '3', load: 245 },
              ],
            }],
          },
          notes: null,
          createdAt: '2026-04-15T12:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)
    await findByText('6 x 255 lb')
  })

  test('strength results with no load fall back to set-count summary', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        {
          id: '1',
          workout: { id: 'w-1', title: 'Bodyweight', type: 'GYMNASTICS', scheduledAt: '2026-04-15T12:00:00.000Z' },
          level: 'RX' as const,
          workoutGender: 'MALE' as const,
          value: {
            movementResults: [{
              workoutMovementId: 'm-1',
              sets: [{ reps: '10' }, { reps: '8' }, { reps: '6' }],
            }],
          },
          notes: null,
          createdAt: '2026-04-15T12:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)
    await findByText('3 sets logged')
  })

  test('FOR_TIME with cappedOut renders as "(capped)"', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        makeResult('1', '2026-04-15T12:00:00.000Z', 'FOR_TIME', { score: { kind: 'TIME', seconds: 600, cappedOut: true }, movementResults: [] }),
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)
    await findByText(/capped/)
  })

  test('tapping a row navigates to WodDetail with from=history', async () => {
    ;(api.me.results as jest.Mock).mockResolvedValue({
      results: [
        makeResult('1', '2026-04-15T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 3, reps: 12, cappedOut: false }, movementResults: [] }),
      ],
      total: 1,
      page: 1,
      limit: 20,
      pages: 1,
    })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)

    fireEvent.press(await findByText('Workout 1'))
    expect(navigation.navigate).toHaveBeenCalledWith('WodDetail', { workoutId: 'w-1', from: 'history' })
  })

  test('paginates: Next click reloads with page+1; reads the `pages` field, not `totalPages`', async () => {
    ;(api.me.results as jest.Mock)
      .mockResolvedValueOnce({
        results: [makeResult('1', '2026-04-15T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 1, reps: 0, cappedOut: false }, movementResults: [] })],
        total: 25,
        page: 1,
        limit: 20,
        pages: 2,
      })
      .mockResolvedValueOnce({
        results: [makeResult('2', '2026-03-15T12:00:00.000Z', 'AMRAP', { score: { kind: 'ROUNDS_REPS', rounds: 2, reps: 0, cappedOut: false }, movementResults: [] })],
        total: 25,
        page: 2,
        limit: 20,
        pages: 2,
      })

    const { findByText } = render(<HistoryScreen navigation={navigation} route={{ params: {} } as any} />)
    await findByText('Page 1 of 2')

    fireEvent.press(await findByText('Next'))

    await waitFor(() => expect(api.me.results).toHaveBeenLastCalledWith(2))
    await findByText('Page 2 of 2')
  })
})
