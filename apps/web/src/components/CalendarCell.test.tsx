import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import CalendarCell from './CalendarCell'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import type { Workout, WorkoutType } from '../lib/api'

function makeWorkout(type: WorkoutType, overrides: Partial<Workout> = {}): Workout {
  return {
    id: `w-${type}`,
    title: `${type} workout`,
    description: null,
    type,
    status: 'PUBLISHED',
    scheduledAt: '2026-04-15T12:00:00.000Z',
    dayOrder: 0,
    workoutMovements: [],
    programId: null,
    program: null,
    namedWorkoutId: null,
    namedWorkout: null,
    _count: { results: 0 },
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as Workout
}

const ALL_TYPES: WorkoutType[] = [
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
  'CARDIO', 'RUNNING', 'ROWING', 'BIKING', 'SWIMMING', 'SKI_ERG', 'MIXED_MONO',
  'GYMNASTICS', 'WEIGHTLIFTING_TECHNIQUE',
  'WARMUP', 'MOBILITY', 'COOLDOWN',
]

describe('CalendarCell', () => {
  it('renders each workout pill with the type-specific accentBar class', () => {
    // Render one cell per type so each pill is the only one in its render scope.
    for (const type of ALL_TYPES) {
      const onAddClick = vi.fn()
      const onWorkoutClick = vi.fn()
      const { unmount } = render(
        <CalendarCell
          date={new Date(2026, 3, 15)}
          isToday={false}
          workouts={[makeWorkout(type)]}
          selected={false}
          onAddClick={onAddClick}
          onWorkoutClick={onWorkoutClick}
        />,
      )

      const pill = screen.getByRole('button', { name: new RegExp(`${type} workout`) })
      expect(pill.className).toContain('border-l-2')
      expect(pill.className).toContain(WORKOUT_TYPE_STYLES[type].accentBar)
      unmount()
    }
  })

  it('renders the + button hover-only (opacity-0 default, group-hover:opacity-100)', () => {
    render(
      <CalendarCell
        date={new Date(2026, 3, 15)}
        isToday={false}
        workouts={[]}
        selected={false}
        onAddClick={vi.fn()}
        onWorkoutClick={vi.fn()}
      />,
    )
    const addBtn = screen.getByRole('button', { name: 'Add workout' })
    expect(addBtn.className).toContain('opacity-0')
    expect(addBtn.className).toContain('group-hover:opacity-100')
  })

  it('+ button click fires onAddClick', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    render(
      <CalendarCell
        date={new Date(2026, 3, 15)}
        isToday={false}
        workouts={[]}
        selected={false}
        onAddClick={onAddClick}
        onWorkoutClick={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add workout' }))
    expect(onAddClick).toHaveBeenCalledTimes(1)
  })

  it('clicking the cell background does NOT fire onAddClick', async () => {
    const user = userEvent.setup()
    const onAddClick = vi.fn()
    const { container } = render(
      <CalendarCell
        date={new Date(2026, 3, 15)}
        isToday={false}
        workouts={[]}
        selected={false}
        onAddClick={onAddClick}
        onWorkoutClick={vi.fn()}
      />,
    )
    // The outermost div is the cell background.
    const cell = container.firstChild as HTMLElement
    await user.click(cell)
    expect(onAddClick).not.toHaveBeenCalled()
  })

  it('workout pill carries title attribute equal to workout title', () => {
    render(
      <CalendarCell
        date={new Date(2026, 3, 15)}
        isToday={false}
        workouts={[makeWorkout('AMRAP', { title: 'Long Workout Name' })]}
        selected={false}
        onAddClick={vi.fn()}
        onWorkoutClick={vi.fn()}
      />,
    )
    const pill = screen.getByRole('button', { name: /Long Workout Name/ })
    expect(pill).toHaveAttribute('title', 'Long Workout Name')
  })

  it('shows up to MAX_VISIBLE pills and renders an overflow indicator', () => {
    const workouts: Workout[] = [
      makeWorkout('AMRAP',    { id: 'w-1', title: 'WOD A' }),
      makeWorkout('FOR_TIME', { id: 'w-2', title: 'WOD B' }),
      makeWorkout('EMOM',     { id: 'w-3', title: 'WOD C' }),
      makeWorkout('METCON',   { id: 'w-4', title: 'WOD D' }),
      makeWorkout('STRENGTH', { id: 'w-5', title: 'WOD E' }),
    ]
    render(
      <CalendarCell
        date={new Date(2026, 3, 15)}
        isToday={false}
        workouts={workouts}
        selected={false}
        onAddClick={vi.fn()}
        onWorkoutClick={vi.fn()}
      />,
    )
    expect(screen.getByText('WOD A')).toBeInTheDocument()
    expect(screen.getByText('WOD B')).toBeInTheDocument()
    expect(screen.getByText('WOD C')).toBeInTheDocument()
    expect(screen.queryByText('WOD D')).not.toBeInTheDocument()
    expect(screen.queryByText('WOD E')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })
})
