import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WodHeroCard from './WodHeroCard'
import type { Workout, DashboardTodayWorkout, DashboardTodayResult, DashboardLeaderboard } from '../lib/api'

const baseWorkout: Workout = {
  id: 'w1',
  title: 'Helen',
  description: '3 rounds for time:\n400m run, 21 KB swings, 12 pull-ups',
  coachNotes: null,
  type: 'FOR_TIME',
  status: 'PUBLISHED',
  scheduledAt: new Date().toISOString(),
  dayOrder: 0,
  workoutMovements: [
    {
      movement: { id: 'm1', name: 'Run', parentId: null },
      displayOrder: 0,
      sets: null, reps: null, load: null, loadUnit: null,
      tracksLoad: false, tempo: null, distance: 400, distanceUnit: 'M',
      calories: null, seconds: null,
    },
    {
      movement: { id: 'm2', name: 'Kettlebell Swing', parentId: null },
      displayOrder: 1,
      sets: 3, reps: '21', load: 24, loadUnit: 'KG',
      tracksLoad: true, tempo: null, distance: null, distanceUnit: null,
      calories: null, seconds: null,
    },
  ],
  programId: 'p1',
  program: { id: 'p1', name: 'Main WOD' },
  namedWorkoutId: 'nw1',
  namedWorkout: { id: 'nw1', name: 'Helen', category: 'GIRL_WOD' },
  timeCapSeconds: 900,
  tracksRounds: false,
  _count: { results: 12 },
  externalSourceId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const warmupWorkout: Workout = {
  ...baseWorkout,
  id: 'w2',
  title: 'Daily Warm Up',
  description: '10 min general warm up',
  type: 'WARMUP',
  workoutMovements: [],
  timeCapSeconds: null,
  namedWorkoutId: null,
  namedWorkout: null,
}

const baseLeaderboard: DashboardLeaderboard = {
  rank: 5,
  totalLogged: 20,
  percentile: 80,
}

const baseResult: DashboardTodayResult = {
  id: 'r1',
  value: { score: { kind: 'TIME', seconds: 462, cappedOut: false } },
  level: 'RX',
  workoutGender: 'OPEN',
  primaryScoreKind: 'TIME',
  primaryScoreValue: 462,
  createdAt: new Date().toISOString(),
  notes: null,
}

const baseEntry: DashboardTodayWorkout = {
  workout: baseWorkout,
  myResult: null,
  leaderboard: { rank: null, totalLogged: 0, percentile: null },
  programSubscriberCount: 0,
  isHeroWorkoutGymAffiliated: true,
}

const warmupEntry: DashboardTodayWorkout = {
  workout: warmupWorkout,
  myResult: null,
  leaderboard: { rank: null, totalLogged: 0, percentile: null },
  programSubscriberCount: 0,
  isHeroWorkoutGymAffiliated: true,
}

interface OverrideProps {
  workouts?: DashboardTodayWorkout[]
  gymMemberCount?: number
  activeIdx?: number
  onActiveIdxChange?: (idx: number) => void
  compact?: boolean
}

function renderCard(overrides: OverrideProps = {}) {
  const onActiveIdxChange = overrides.onActiveIdxChange ?? vi.fn()
  return render(
    <MemoryRouter>
      <WodHeroCard
        workouts={[baseEntry]}
        gymMemberCount={50}
        activeIdx={0}
        onActiveIdxChange={onActiveIdxChange}
        {...overrides}
      />
    </MemoryRouter>,
  )
}

describe('WodHeroCard', () => {
  it('renders workout title', () => {
    renderCard()
    expect(screen.getByText('Helen')).toBeInTheDocument()
  })

  it('shows type badge', () => {
    renderCard()
    expect(screen.getByText('FT')).toBeInTheDocument()
  })

  it('shows time cap', () => {
    renderCard()
    expect(screen.getByText('15 min cap')).toBeInTheDocument()
  })

  it('shows program attribution', () => {
    renderCard()
    expect(screen.getByText('via Main WOD')).toBeInTheDocument()
  })

  it('shows CTA buttons when not logged', () => {
    renderCard()
    expect(screen.getByText('Start workout')).toBeInTheDocument()
    expect(screen.getByText('Log result')).toBeInTheDocument()
  })

  it('shows result card when logged', () => {
    renderCard({ workouts: [{ ...baseEntry, myResult: baseResult, leaderboard: baseLeaderboard }] })
    expect(screen.getByText('7:42')).toBeInTheDocument()
    expect(screen.getByText('RX')).toBeInTheDocument()
    expect(screen.queryByText('Start workout')).not.toBeInTheDocument()
  })

  it('shows rank and total when logged', () => {
    renderCard({ workouts: [{ ...baseEntry, myResult: baseResult, leaderboard: baseLeaderboard }] })
    expect(screen.getByText(/#5/)).toBeInTheDocument()
  })

  it('shows participant count in footer', () => {
    renderCard({ workouts: [{ ...baseEntry, leaderboard: baseLeaderboard }] })
    // count is in a styled child span; RTL getByText only matches direct text nodes
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText(/members logged today/)).toBeInTheDocument()
  })

  it('shows gym member total in footer when gymMemberCount > 0', () => {
    renderCard({ workouts: [{ ...baseEntry, leaderboard: baseLeaderboard }], gymMemberCount: 50 })
    expect(screen.getByText(/of 50/)).toBeInTheDocument()
  })

  it('renders workout description on desktop (not compact)', () => {
    renderCard()
    expect(screen.getByText(/3 rounds for time/)).toBeInTheDocument()
  })

  it('renders compact view without workout blocks', () => {
    renderCard({ compact: true })
    expect(screen.queryByText(/3 rounds for time/)).not.toBeInTheDocument()
    expect(screen.getByText('View workout details →')).toBeInTheDocument()
  })

  it('shows movement list on desktop', () => {
    renderCard()
    expect(screen.getByText('Kettlebell Swing')).toBeInTheDocument()
  })

  it('does not render tabs when there is only one workout', () => {
    renderCard()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('renders tabs when there are multiple workouts', () => {
    renderCard({ workouts: [baseEntry, warmupEntry] })
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onActiveIdxChange when a non-active tab is clicked', () => {
    const onActiveIdxChange = vi.fn()
    renderCard({ workouts: [baseEntry, warmupEntry], onActiveIdxChange })
    const tabs = screen.getAllByRole('tab')
    fireEvent.click(tabs[1])
    expect(onActiveIdxChange).toHaveBeenCalledWith(1)
  })

  it('shows the workout for the active tab index', () => {
    renderCard({ workouts: [baseEntry, warmupEntry], activeIdx: 1 })
    // The heading link is the canonical source — the same text also appears in the tab label
    expect(screen.getByRole('heading', { name: 'Daily Warm Up' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Helen' })).not.toBeInTheDocument()
  })
})
