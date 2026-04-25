import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Feed from './Feed'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import type { WorkoutType } from '../lib/api'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/api', () => ({
  api: {
    workouts: { list: vi.fn() },
  },
}))

vi.mock('../context/GymContext.tsx', () => ({
  useGym: () => ({ gymId: 'gym-1', gymRole: 'OWNER', gyms: [], setGymId: vi.fn(), loading: false }),
}))

import { api } from '../lib/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_TYPES: WorkoutType[] = [
  // Strength
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
  // Conditioning
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

describe('Feed — workout-type tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
