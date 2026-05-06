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

const TODAY = new Date(2026, 4, 4) // May 4, 2026 (Mon)

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
  it('renders one column per day with weekday + date number', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    // May 4 is Monday → DAY_LABELS[1] = 'Mon'. Three days starting Mon
    // gives Mon, Tue, Wed; assert each weekday label and date number.
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Tue')).toBeInTheDocument()
    expect(screen.getByText('Wed')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
  })

  it('renders the date-range label in the nav row', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getByText(/May 4.*May 6/)).toBeInTheDocument()
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
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getByText('Fran')).toBeInTheDocument()
    expect(screen.getByText('Cindy')).toBeInTheDocument()
  })

  it('truncates to MAX_VISIBLE workouts and shows the +N more overflow', () => {
    // Component caps visible workouts per day at 4 (MAX_VISIBLE in source).
    // With 6 on a single day we expect 4 rendered + "+2 more".
    const six = Array.from({ length: 6 }, (_, i) => makeWorkout({ id: `w-${i}`, title: `Workout ${i}` }))
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{ '2026-05-04': six }}
        selectedDate={null}
        selectedWorkoutId={null}
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.getByText('Workout 0')).toBeInTheDocument()
    expect(screen.getByText('Workout 3')).toBeInTheDocument()
    expect(screen.queryByText('Workout 4')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
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
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={onAddClick}
        onWorkoutClick={noop}
      />,
    )
    fireEvent.click(screen.getByLabelText('Add workout on 2026-05-04'))
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
        loading={false}
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
        loading={false}
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

  it('omits the Today button when onJumpToToday is not provided', () => {
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        loading={false}
        onPrev={noop}
        onNext={noop}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('renders a Today button between the prev arrow and the range label so the arrow stays anchored', () => {
    const onJumpToToday = vi.fn()
    render(
      <CalendarDayStrip
        days={buildDays(TODAY, 3)}
        today={TODAY}
        workoutsByDate={{}}
        selectedDate={null}
        selectedWorkoutId={null}
        loading={false}
        onPrev={noop}
        onNext={noop}
        onJumpToToday={onJumpToToday}
        onAddClick={noop}
        onWorkoutClick={noop}
      />,
    )
    const buttons = screen.getAllByRole('button')
    const prevIdx = buttons.findIndex((b) => b.getAttribute('aria-label') === 'Previous days')
    const todayIdx = buttons.findIndex((b) => b.textContent === 'Today')
    const nextIdx = buttons.findIndex((b) => b.getAttribute('aria-label') === 'Next days')
    // DOM order: ← Today range → — so Today is between prev and next, and
    // strictly after prev. Asserts the prev arrow keeps its leftmost spot.
    expect(prevIdx).toBeLessThan(todayIdx)
    expect(todayIdx).toBeLessThan(nextIdx)
    // The range label is in the same flex group as Today; its DOM order
    // is right after Today.
    const rangeLabel = screen.getByText(/May \d/)
    expect(buttons[todayIdx].compareDocumentPosition(rangeLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(buttons[todayIdx])
    expect(onJumpToToday).toHaveBeenCalledTimes(1)
  })
})
