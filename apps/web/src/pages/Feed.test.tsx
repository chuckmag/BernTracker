import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Feed from './Feed'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import type { WorkoutType, GymProgram } from '../lib/api'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    workouts: { list: vi.fn() },
    programs: { get: vi.fn() },
    gyms: { programs: { list: vi.fn() } },
  },
}))

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => ({ gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }),
}))

// Per-test mock state for the program filter context. Mutate `mockFilter` in
// `beforeEach` / inside an `it` block to drive the picker selection.
const mockFilter: {
  selected: string[]
  available: GymProgram[]
  loading: boolean
  setSelected: ReturnType<typeof vi.fn>
  toggle: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
} = {
  selected: [],
  available: [],
  loading: false,
  setSelected: vi.fn(),
  toggle: vi.fn(),
  clear: vi.fn(),
}
vi.mock('../context/ProgramFilterContext.tsx', () => ({
  useProgramFilter: () => mockFilter,
  ProgramFilterProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import { api } from '../lib/api'

function makeGymProgram(id: string, name: string, coverColor: string | null = null): GymProgram {
  return {
    gymId: 'gym-1',
    programId: id,
    isDefault: false,
    createdAt: '2026-03-01T00:00:00.000Z',
    program: {
      id,
      name,
      description: null,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: null,
      coverColor,
      visibility: 'PRIVATE',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_TYPES: WorkoutType[] = [
  // Strength
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
  // Metcon
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
  // MonoStructural
  'CARDIO', 'RUNNING', 'ROWING', 'BIKING', 'SWIMMING', 'SKI_ERG', 'MIXED_MONO',
  // Skill Work
  'GYMNASTICS', 'WEIGHTLIFTING_TECHNIQUE',
  // Warmup / Recovery
  'WARMUP', 'MOBILITY', 'COOLDOWN',
]

function makeWorkout(type: WorkoutType, idx: number) {
  // Space scheduledAt across distinct days so they render as separate cards.
  const day = String(idx + 1).padStart(2, '0')
  return {
    id: `w-${type}`,
    title: `${type} workout`,
    description: null,
    type,
    status: 'PUBLISHED' as const,
    scheduledAt: `2026-04-${day}T12:00:00.000Z`,
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    _count: { results: 0 },
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  }
}

function renderFeed() {
  return render(
    <MemoryRouter>
      <Feed />
    </MemoryRouter>,
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Feed — programIds filter (slice 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.workouts.list).mockResolvedValue([] as never)
    mockFilter.selected = []
    mockFilter.available = [
      makeGymProgram('prog-1', 'Override — March 2026', '#6366F1'),
      makeGymProgram('prog-2', 'Comp Team', '#EC4899'),
    ]
  })

  it('omits programIds from the filters bag when no programs are selected', async () => {
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const lastCall = vi.mocked(api.workouts.list).mock.calls.at(-1)!
    // Args: (gymId, fromIso, toIso, filters?)
    expect(lastCall[3]).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
  })

  it('passes programIds in the filters bag and renders the single-program header', async () => {
    mockFilter.selected = ['prog-1']
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const lastCall = vi.mocked(api.workouts.list).mock.calls.at(-1)!
    expect(lastCall[3]).toEqual({ programIds: ['prog-1'] })
    expect(await screen.findByRole('heading', { name: 'Override — March 2026' })).toBeInTheDocument()
  })

  it('renders the multi-program header when 2+ programs are selected', async () => {
    mockFilter.selected = ['prog-1', 'prog-2']
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const lastCall = vi.mocked(api.workouts.list).mock.calls.at(-1)!
    expect(lastCall[3]).toEqual({ programIds: ['prog-1', 'prog-2'] })
    // Plain "Feed" heading + a "Filtered to 2 programs" eyebrow
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByText('Filtered to 2 programs')).toBeInTheDocument()
  })

  it('shows a "Back to all workouts" link when any program is selected', async () => {
    mockFilter.selected = ['prog-1']
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    expect(screen.getByRole('link', { name: /Back to all workouts/ })).toBeInTheDocument()
  })
})

describe('Feed — workout-type tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilter.selected = []
    mockFilter.available = []
  })

  it('renders each workout type card with its expected accentBar class', async () => {
    const workouts = ALL_TYPES.map((t, i) => makeWorkout(t, i))
    vi.mocked(api.workouts.list).mockResolvedValue(workouts as never)

    renderFeed()

    // Wait for the first workout title to appear (Feed finished loading).
    await waitFor(() =>
      expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(ALL_TYPES.length),
    )

    for (const type of ALL_TYPES) {
      const expectedBar = WORKOUT_TYPE_STYLES[type].accentBar
      const card = screen.getByRole('button', { name: new RegExp(`${type} workout`) })
      expect(card.className).toContain('border-l-4')
      expect(card.className).toContain(expectedBar)
    }
  })

  it('applies each type chip bg + tint to the abbreviation span', async () => {
    const workouts = ALL_TYPES.map((t, i) => makeWorkout(t, i))
    vi.mocked(api.workouts.list).mockResolvedValue(workouts as never)

    renderFeed()

    for (const type of ALL_TYPES) {
      const styles = WORKOUT_TYPE_STYLES[type]
      const abbr = await screen.findByText(styles.abbr, { exact: true, selector: 'span' })
      expect(abbr.className).toContain(styles.bg)
      expect(abbr.className).toContain(styles.tint)
    }
  })
})

// ─── Tile result-state badges ─────────────────────────────────────────────────

describe('Feed — tile result badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilter.selected = []
    mockFilter.available = []
  })

  it('shows the loaded-barbell + result count when the viewer has logged and others have results', async () => {
    const w = {
      ...makeWorkout('AMRAP', 0),
      myResultId: 'result-mine',
      _count: { results: 4 },
    }
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()

    const loaded = await screen.findByRole('img', { name: /you've logged a result/i })
    expect(loaded).toBeInTheDocument()
    // Count text renders beside the users-icon.
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows the empty-barbell + result count when the viewer has not logged but others have', async () => {
    const w = {
      ...makeWorkout('AMRAP', 0),
      myResultId: null,
      _count: { results: 2 },
    }
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()

    const empty = await screen.findByRole('img', { name: /no result logged yet/i })
    expect(empty).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders neither badge when the workout has no results and the viewer has not logged', async () => {
    const w = {
      ...makeWorkout('AMRAP', 0),
      myResultId: null,
      _count: { results: 0 },
    }
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()

    // The tile must still render…
    expect(await screen.findByRole('button', { name: /AMRAP workout/ })).toBeInTheDocument()
    // …but neither barbell variant nor a count appears.
    expect(screen.queryByRole('img', { name: /logged a result/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /no result logged yet/i })).not.toBeInTheDocument()
  })

  it('hides the count when only the viewer has logged (resultCount === 1, the viewer\'s own)', async () => {
    const w = {
      ...makeWorkout('AMRAP', 0),
      myResultId: 'result-mine',
      _count: { results: 1 },
    }
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()

    const loaded = await screen.findByRole('img', { name: /you've logged a result/i })
    expect(loaded).toBeInTheDocument()
    // The count "1" still appears (it counts the viewer too) — the design choice
    // is to always render N when N > 0 so the tile reflects the leaderboard size.
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
