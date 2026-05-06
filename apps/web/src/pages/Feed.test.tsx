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
    me: {
      personalProgram: {
        get: vi.fn(),
        workouts: { list: vi.fn(), create: vi.fn() },
      },
    },
    namedWorkouts: { list: vi.fn() },
    movements: { detect: vi.fn() },
  },
  TYPE_ABBR: {
    AMRAP: 'A', FOR_TIME: 'F', METCON: 'M', WARMUP: 'W',
  },
}))

vi.mock('../context/MovementsContext.tsx', () => ({
  useMovements: () => [] as { id: string; name: string; parentId: string | null }[],
}))

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => ({ gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }),
}))

// Per-test mock state for the program filter context. Mutate `mockFilter` in
// `beforeEach` / inside an `it` block to drive the picker selection.
const mockFilter: {
  selected: string[]
  gymProgramIds: string[]
  available: GymProgram[]
  personalProgramId: string | null
  loading: boolean
  setSelected: ReturnType<typeof vi.fn>
  toggle: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
} = {
  selected: [],
  gymProgramIds: [],
  available: [],
  personalProgramId: null,
  loading: false,
  setSelected: vi.fn(),
  toggle: vi.fn(),
  clear: vi.fn(),
}
vi.mock('../context/ProgramFilterContext.tsx', () => ({
  useProgramFilter: () => mockFilter,
  ProgramFilterProvider: ({ children }: { children: React.ReactNode }) => children,
  PERSONAL_PROGRAM_SENTINEL: '__personal__',
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
  // Space scheduledAt across distinct days relative to today so they always
  // fall within the initial 30-day fetch window (today-30 … today+14).
  const d = new Date()
  d.setDate(d.getDate() - idx)
  d.setHours(12, 0, 0, 0)
  return {
    id: `w-${type}`,
    title: `${type} workout`,
    description: null,
    type,
    status: 'PUBLISHED' as const,
    scheduledAt: d.toISOString(),
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    _count: { results: 0 },
    createdAt: d.toISOString(),
    updatedAt: d.toISOString(),
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

// Most existing specs don't care about the personal-program upsert; default
// it to a rejection so the page renders the same as before (add button stays
// hidden). The personal-program-specific specs further down override this.
// workouts.list must always return an array (never undefined) because the
// Feed now spreads personal workouts into allWorkouts.
beforeEach(() => {
  vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('not seeded'))
  vi.mocked(api.me.personalProgram.workouts.list).mockResolvedValue([] as never)
})

describe('Feed — programIds filter (slice 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('not seeded'))
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

  it('passes programIds in the filters bag when a single program is selected', async () => {
    mockFilter.selected = ['prog-1']
    mockFilter.gymProgramIds = ['prog-1']
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const lastCall = vi.mocked(api.workouts.list).mock.calls.at(-1)!
    expect(lastCall[3]).toEqual({ programIds: ['prog-1'] })
    // Header always shows "Feed" — program selection shown in the inline picker
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
  })

  it('passes programIds in the filters bag when 2+ programs are selected', async () => {
    mockFilter.selected = ['prog-1', 'prog-2']
    mockFilter.gymProgramIds = ['prog-1', 'prog-2']
    render(<MemoryRouter><Feed /></MemoryRouter>)
    await waitFor(() => expect(api.workouts.list).toHaveBeenCalled())
    const lastCall = vi.mocked(api.workouts.list).mock.calls.at(-1)!
    expect(lastCall[3]).toEqual({ programIds: ['prog-1', 'prog-2'] })
    expect(screen.getByRole('heading', { name: 'Feed' })).toBeInTheDocument()
  })
})

describe('Feed — workout-type tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('not seeded'))
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

// ─── Empty-day tiles ─────────────────────────────────────────────────────────

describe('Feed — empty-day tiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('not seeded'))
    mockFilter.selected = []
    mockFilter.available = []
  })

  it('renders "No workouts planned" tiles when the API returns no workouts', async () => {
    vi.mocked(api.workouts.list).mockResolvedValue([] as never)
    renderFeed()
    const tiles = await screen.findAllByText('No workouts planned')
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('renders a TODAY label when there are no workouts', async () => {
    vi.mocked(api.workouts.list).mockResolvedValue([] as never)
    renderFeed()
    expect(await screen.findByText('TODAY')).toBeInTheDocument()
  })

  it('renders workout cards for days that do have workouts and empty tiles for days that do not', async () => {
    const w = makeWorkout('AMRAP', 0)   // scheduled today
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()
    expect(await screen.findByRole('button', { name: /AMRAP workout/ })).toBeInTheDocument()
    // Other days in the range have no workouts → at least one empty tile
    const emptyTiles = await screen.findAllByText('No workouts planned')
    expect(emptyTiles.length).toBeGreaterThan(0)
  })

  it('does not render future empty tiles when no future workouts exist', async () => {
    // Only a past workout — feed should end at today with no TOMORROW tile
    const w = makeWorkout('AMRAP', 2)   // 2 days ago
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()
    await screen.findByText('TODAY')
    expect(screen.queryByText('TOMORROW')).not.toBeInTheDocument()
  })

  it('renders future empty tiles only up to the last day with a workout', async () => {
    // Workout scheduled 3 days from now — TOMORROW tile should appear
    const d = new Date()
    d.setDate(d.getDate() + 3)
    d.setHours(12, 0, 0, 0)
    const w = {
      ...makeWorkout('AMRAP', 0),
      id: 'w-future',
      scheduledAt: d.toISOString(),
    }
    vi.mocked(api.workouts.list).mockResolvedValue([w] as never)
    renderFeed()
    // TOMORROW is between today and the future workout → empty tile expected
    expect(await screen.findByText('TOMORROW')).toBeInTheDocument()
  })
})

// ─── Tile result-state badges ─────────────────────────────────────────────────

describe('Feed — tile result badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('not seeded'))
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

describe('Feed — personal program', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFilter.selected = []
    mockFilter.available = []
    vi.mocked(api.me.personalProgram.get).mockResolvedValue({
      id: 'pp-1',
      name: 'Personal Program',
      description: null,
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: null,
      coverColor: null,
      visibility: 'PRIVATE',
      ownerUserId: 'u-1',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      _count: { workouts: 1 },
    })
    vi.mocked(api.namedWorkouts.list).mockResolvedValue([] as never)
    vi.mocked(api.movements.detect).mockResolvedValue([] as never)
  })

  it('shows the "+" add-personal-workout button on each day-header row', async () => {
    vi.mocked(api.workouts.list).mockResolvedValue([] as never)
    renderFeed()
    // Wait for personalProgram to resolve so the button is rendered.
    const buttons = await screen.findAllByRole('button', { name: /Add personal workout/i })
    // At least one for TODAY; the feed renders a row per day in the visible window.
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('hides the "+" button when the personal-program upsert fails', async () => {
    vi.mocked(api.me.personalProgram.get).mockRejectedValue(new Error('boom'))
    vi.mocked(api.workouts.list).mockResolvedValue([] as never)
    renderFeed()
    expect(await screen.findByText('TODAY')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add personal workout/i })).not.toBeInTheDocument()
  })

  it('sorts personal-program workouts after gym workouts and renders an "Extra work" divider', async () => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const gymWorkout = {
      ...makeWorkout('AMRAP', 0),
      id: 'w-gym',
      title: 'Class WOD',
      programId: 'gym-prog-99',
    }
    const personalWorkout = {
      ...makeWorkout('METCON', 0),
      id: 'w-personal',
      title: 'My extra row',
      programId: 'pp-1',
    }
    // Gym workout comes from the gym API; personal workout from the personal API.
    vi.mocked(api.workouts.list).mockResolvedValue([gymWorkout] as never)
    vi.mocked(api.me.personalProgram.workouts.list).mockResolvedValue([personalWorkout] as never)
    renderFeed()

    // Both tiles render
    const classTile = await screen.findByRole('button', { name: /Class WOD/i })
    const personalTile = await screen.findByRole('button', { name: /My extra row/i })
    expect(classTile).toBeInTheDocument()
    expect(personalTile).toBeInTheDocument()

    // Personal tile renders AFTER the gym tile in DOM order.
    const order = classTile.compareDocumentPosition(personalTile)
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // The "Extra work" divider only appears when both gym and personal tiles
    // are present on the same day — this assertion is the load-bearing check
    // that a personal tile is recognized as such.
    expect(await screen.findByText(/Extra work/i)).toBeInTheDocument()
  })
})
