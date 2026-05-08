/**
 * Unit tests for HotTodayCard
 */

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import HotTodayCard from '../src/components/HotTodayCard'
import type { LeaderboardEntry } from '../src/lib/api'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({ navigate: mockNavigate })),
}))

jest.mock('../src/lib/api', () => ({
  api: {
    workouts: {
      results: jest.fn(),
    },
  },
}))

jest.mock('../src/lib/format', () => ({
  formatResultValue: () => '5:00',
}))

import { api } from '../src/lib/api'

function makeEntry(
  id: string,
  reactions: number,
  comments: number,
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  return {
    id,
    user: { id, name: `User ${id}`, firstName: null, lastName: null, avatarUrl: null, birthday: null },
    level: 'RX',
    workoutGender: 'OPEN',
    value: { score: { kind: 'TIME', seconds: 300 } },
    notes: null,
    createdAt: new Date().toISOString(),
    _count: { reactions, comments },
    ...overrides,
  }
}

describe('HotTodayCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows empty state when no results have social activity', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([
      makeEntry('u1', 0, 0),
      makeEntry('u2', 0, 0),
    ])
    const { findByText } = render(<HotTodayCard workoutId="w1" />)
    expect(await findByText(/No reactions yet/)).toBeTruthy()
  })

  it('renders top 3 by hot score', async () => {
    // hotScore: u1=4, u2=5(1+2×2), u3=10, u4=4(2+1×2)
    jest.mocked(api.workouts.results).mockResolvedValue([
      makeEntry('u1', 4, 0),
      makeEntry('u2', 1, 2),
      makeEntry('u3', 10, 0),
      makeEntry('u4', 2, 1),
    ])
    const { queryAllByText, findByText } = render(<HotTodayCard workoutId="w1" />)
    await findByText('User u3')
    const rows = queryAllByText(/^User u/)
    expect(rows).toHaveLength(3)
    // top 3: u3(10), u2(5), u1 or u4 (both 4 — u1 wins on reactions tiebreak)
    expect(rows[0].props.children).toBe('User u3')
    expect(rows[1].props.children).toBe('User u2')
  })

  it('breaks ties by reaction count descending', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([
      makeEntry('ua', 2, 1),   // hotScore=4, reactions=2
      makeEntry('ub', 4, 0),   // hotScore=4, reactions=4 — wins tiebreak
    ])
    const { findByText, queryAllByText } = render(<HotTodayCard workoutId="w1" />)
    await findByText('User ub')
    const rows = queryAllByText(/^User u/)
    expect(rows[0].props.children).toBe('User ub')
    expect(rows[1].props.children).toBe('User ua')
  })

  it('shows reaction count badge when reactions > 0', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([makeEntry('u1', 7, 0)])
    const { findByLabelText } = render(<HotTodayCard workoutId="w1" />)
    expect(await findByLabelText('7 reactions')).toBeTruthy()
  })

  it('shows comment count badge when comments > 0', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([makeEntry('u1', 1, 4)])
    const { findByLabelText } = render(<HotTodayCard workoutId="w1" />)
    expect(await findByLabelText('4 comments')).toBeTruthy()
  })

  it('renders the Hot Today header', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([makeEntry('u1', 3, 0)])
    const { findByText } = render(<HotTodayCard workoutId="w1" />)
    expect(await findByText(/Hot Today/i)).toBeTruthy()
  })

  it('navigates to ResultDetail when a row is pressed', async () => {
    jest.mocked(api.workouts.results).mockResolvedValue([makeEntry('u1', 5, 0)])
    const { findByText } = render(<HotTodayCard workoutId="wkid" />)
    const nameText = await findByText('User u1')
    fireEvent.press(nameText)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('ResultDetail', { workoutId: 'wkid', resultId: 'u1', from: 'dashboard' })
    })
  })
})
