import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import WodHeroCard from '../src/components/WodHeroCard'
import type { DashboardTodayWorkout } from '../src/lib/api'

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}))

jest.mock('../src/lib/format', () => ({
  formatResultValue: () => '5:00',
}))

function makeEntry(overrides: Partial<DashboardTodayWorkout['workout']> = {}): DashboardTodayWorkout {
  return {
    workout: {
      id: 'w1',
      title: 'Fran',
      description: '21-15-9',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: '2026-06-01T12:00:00.000Z',
      programId: 'p1',
      workoutMovements: [],
      timeCapSeconds: null,
      tracksRounds: false,
      externalSourceId: null,
      program: { id: 'p1', name: 'CrossFit Mainsite' },
      namedWorkout: null,
      _count: { results: 0 },
      ...overrides,
    } as any,
    myResult: null,
    leaderboard: { rank: null, totalLogged: 0, percentile: null },
    programSubscriberCount: 0,
    isHeroWorkoutGymAffiliated: true,
  }
}

describe('WodHeroCard', () => {
  it('renders the active workout when given a non-empty workouts array', () => {
    const { getByText, queryByText } = render(
      <WodHeroCard
        workouts={[makeEntry()]}
        gymMemberCount={10}
        activeIdx={0}
        onActiveIdxChange={() => {}}
      />,
    )
    expect(getByText('Fran')).toBeTruthy()
    expect(queryByText('No workout today')).toBeNull()
  })

  it('renders the empty state when the workouts array is empty', () => {
    const { getByText, queryByText } = render(
      <WodHeroCard
        workouts={[]}
        gymMemberCount={10}
        activeIdx={0}
        onActiveIdxChange={() => {}}
      />,
    )
    expect(getByText('No workout today')).toBeTruthy()
    expect(queryByText('Fran')).toBeNull()
  })

  it('renders one tab per workout when multiple workouts are scheduled', () => {
    const workouts: DashboardTodayWorkout[] = [
      { ...makeEntry({ id: 'w-warmup', title: 'Warm Up', type: 'WARMUP' }) },
      { ...makeEntry({ id: 'w-main', title: 'Fran' }) },
    ]
    const { getByText, getAllByText } = render(
      <WodHeroCard
        workouts={workouts}
        gymMemberCount={10}
        activeIdx={1}
        onActiveIdxChange={() => {}}
      />,
    )
    // Warm Up appears once in the tab strip; Fran appears twice (tab + active hero).
    expect(getByText('Warm Up')).toBeTruthy()
    expect(getAllByText('Fran').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onActiveIdxChange when a tab is tapped', () => {
    const onActiveIdxChange = jest.fn()
    const workouts: DashboardTodayWorkout[] = [
      { ...makeEntry({ id: 'w-warmup', title: 'Warm Up', type: 'WARMUP' }) },
      { ...makeEntry({ id: 'w-main', title: 'Fran' }) },
    ]
    const { getByText } = render(
      <WodHeroCard
        workouts={workouts}
        gymMemberCount={10}
        activeIdx={1}
        onActiveIdxChange={onActiveIdxChange}
      />,
    )
    fireEvent.press(getByText('Warm Up'))
    expect(onActiveIdxChange).toHaveBeenCalledWith(0)
  })

  it('falls back to the first workout when activeIdx is out of range', () => {
    const { getByText } = render(
      <WodHeroCard
        workouts={[makeEntry({ id: 'w1', title: 'Fran' })]}
        gymMemberCount={10}
        activeIdx={5}
        onActiveIdxChange={() => {}}
      />,
    )
    expect(getByText('Fran')).toBeTruthy()
  })
})
