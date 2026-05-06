import { type Workout } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Button from './ui/Button'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function dayLabel(date: Date, today: Date): string {
  const k = toDateKey(date)
  if (k === toDateKey(today)) return 'Today'
  if (k === toDateKey(addDays(today, 1))) return 'Tomorrow'
  if (k === toDateKey(addDays(today, -1))) return 'Yesterday'
  return date.toLocaleDateString('default', { weekday: 'long', month: 'short', day: 'numeric' })
}

interface CalendarDayStripProps {
  /** Days to render, oldest → newest. Parent owns window state + paging. */
  days: Date[]
  /** Today, for relative labels ("Today" / "Tomorrow"). Passed in so the
   *  parent's "today" reference stays consistent across renders. */
  today: Date
  /** Workouts grouped by `YYYY-MM-DD`. Parent owns the cache. */
  workoutsByDate: Record<string, Workout[]>
  selectedDate: string | null
  selectedWorkoutId: string | null
  loading?: boolean
  onPrev: () => void
  onNext: () => void
  onAddClick: (dateKey: string) => void
  onWorkoutClick: (dateKey: string, workoutId: string) => void
}

/**
 * Mobile-web view of a 1-3 day window for the workout calendar. Replaces
 * the 7×5 month grid below the `md:` breakpoint, where each cell would
 * compress to ~50px and become unusable. Renders day cards stacked
 * vertically with their full workout list expanded — no truncation, no
 * "+N more" overflow — so a programmer can edit on a phone (#240/#241).
 *
 * Pure presentation: parent (`WorkoutCalendarBoard`) owns the window
 * state, the workouts cache, and the drawer wiring.
 */
export default function CalendarDayStrip({
  days,
  today,
  workoutsByDate,
  selectedDate,
  selectedWorkoutId,
  loading,
  onPrev,
  onNext,
  onAddClick,
  onWorkoutClick,
}: CalendarDayStripProps) {
  const first = days[0]
  const last = days[days.length - 1]
  const windowLabel = first && last
    ? `${first.toLocaleDateString('default', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`
    : ''

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-4">
        <Button variant="tertiary" onClick={onPrev} aria-label="Previous days">←</Button>
        <span className="text-sm font-medium text-center select-none flex-1">{windowLabel}</span>
        <Button variant="tertiary" onClick={onNext} aria-label="Next days">→</Button>
      </div>

      <div
        className={['flex flex-col gap-2', loading ? 'opacity-60' : ''].join(' ')}
        data-testid="calendar-day-strip"
      >
        {days.map((date) => {
          const key = toDateKey(date)
          const dayWorkouts = workoutsByDate[key] ?? []
          const isToday = key === toDateKey(today)
          const isSelected = key === selectedDate && selectedWorkoutId === null
          return (
            <section
              key={key}
              className={[
                'rounded-lg border bg-slate-100 dark:bg-gray-900',
                isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-gray-800',
              ].join(' ')}
            >
              <header className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-gray-800">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={[
                      'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 text-slate-700 dark:bg-gray-800 dark:text-gray-300',
                    ].join(' ')}
                  >
                    {dayLabel(date, today)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-gray-500 truncate">
                    {date.toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <button
                  onClick={() => onAddClick(key)}
                  className="text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 w-8 h-8 flex items-center justify-center rounded text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                  aria-label={`Add workout on ${dayLabel(date, today)}`}
                >+</button>
              </header>

              {dayWorkouts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500 dark:text-gray-500">No workouts planned.</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-gray-800">
                  {dayWorkouts.map((w) => {
                    const styles = WORKOUT_TYPE_STYLES[w.type]
                    const isCurrent = w.id === selectedWorkoutId
                    return (
                      <li key={w.id}>
                        <button
                          onClick={() => onWorkoutClick(key, w.id)}
                          className={[
                            'w-full flex items-center gap-2 px-3 py-2 text-left',
                            'border-l-2',
                            styles?.accentBar ?? 'border-slate-300 dark:border-gray-700',
                            isCurrent
                              ? 'bg-slate-200 dark:bg-gray-800'
                              : 'hover:bg-slate-200/60 dark:hover:bg-gray-800/60',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'text-[11px] shrink-0',
                              w.status === 'PUBLISHED' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400',
                            ].join(' ')}
                            aria-label={w.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                          >
                            {w.status === 'PUBLISHED' ? '●' : '○'}
                          </span>
                          <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 shrink-0 w-5">
                            {styles?.abbr ?? '?'}
                          </span>
                          <span className="text-sm text-slate-700 dark:text-gray-200 truncate flex-1">{w.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
