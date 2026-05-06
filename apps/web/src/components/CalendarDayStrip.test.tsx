import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CalendarDayStrip from './CalendarDayStrip'
import type { Workout } from '../lib/api'

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: 'w-1',
    title: 'Fran',
    type: 'FOR_TIME',
    status: 'PUBLISHED',
    scheduledAt: '2026-05-04T00:00:00.000Z',
    timeCapSeconds: null,
    description: null,
    program: { id: 'prog-1', name: 'General' },
    ...overrides,
  } as Workout
}

const TODAY = new Date(2026, 4, 4) // May 4, 2026

function buildDays(start: Date, count: number): Date[] {
  const days: Date[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    days.push(d)
  }
  return days
}

const noop = () => {}

describe('CalendarDayStrip', () => {
  it('renders one card per day with the right relative labels', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    // Third day uses an absolute label ("Wednesday, May 6"); we only assert
    // something day-shaped renders to avoid timezone churn.
    expect(screen.getAllByText(/May (4|5|6)/).length).toBeGreaterThan(0)
  })

  it('shows "No workouts planned" for empty days', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getAllByText('No workouts planned.')).toHaveLength(3)
  })

  it('renders workouts for matching days using YYYY-MM-DD keys', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{
          '2026-05-04': [makeWorkout({ id: 'a', title: 'Fran' })],
          '2026-05-06': [makeWorkout({ id: 'b', title: 'Cindy' })],
        }}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getByText('Fran')).toBeInTheDocument()
    expect(screen.getByText('Cindy')).toBeInTheDocument()
  })

  it('emits onAddClick with the day key when the + button fires', () => {
    const onAddClick = vi.fn()
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={noop}
        onNext={noop}
        onAddClick={onAddClick}
        onWorkoutClick={noop}
      />,
    )
    fireEvent.click(screen.getByLabelText('Add workout on Today'))
    expect(onAddClick).toHaveBeenCalledWith('2026-05-04')
  })

  it('emits onWorkoutClick with both date and workout id when a workout fires', () => {
    const onWorkoutClick = vi.fn()
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{
          '2026-05-04': [makeWorkout({ id: 'a', title: 'Fran' })],
        }}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={onWorkoutClick}
      />,
    )
    fireEvent.click(screen.getByText('Fran'))
    expect(onWorkoutClick).toHaveBeenCalledWith('2026-05-04', 'a')
  })

  it('emits onPrev / onNext from the chevron buttons', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        onPrev={onPrev}
        onNext={onNext}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    fireEvent.click(screen.getByLabelText('Previous days'))
    fireEvent.click(screen.getByLabelText('Next days'))
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
