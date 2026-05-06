import { type Workout } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Button from './ui/Button'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE = 4

interface CalendarDayStripProps {
  days: Date[]
  today: Date
  workoutsByDate: Record<string, Workout[]>
  selectedDate: string | null
  selectedWorkoutId: string | null
  loading: boolean
  onPrev: () => void
  onNext: () => void
  /** When set, render a "Today" jump button left of the prev chevron.
   *  Parent controls visibility — passes undefined when today is already
   *  in the visible window. */
  onJumpToToday?: () => void
  onAddClick: (dateKey: string) => void
  onWorkoutClick: (dateKey: string, workoutId: string) => void
}

export default function CalendarDayStrip({
  days,
  today,
  workoutsByDate,
  selectedDate,
  loading,
  onPrev,
  onNext,
  onJumpToToday,
  onAddClick,
  onWorkoutClick,
}: CalendarDayStripProps) {
  const todayKey = toDateKey(today)

  return (
    <div data-testid="calendar-day-strip" className={loading ? 'opacity-60 pointer-events-none' : ''}>
      {/* Nav row.
          - 3-column grid (1fr auto 1fr) keeps the range label geometrically
            centered no matter what's in the side cells: the two `1fr`
            cells always claim equal width, so the auto cell sits centered.
          - Prev/next arrows pinned to the row edges via justify-self.
          - Today (when present) sits immediately right of the prev arrow
            inside the left cell — appears/disappears without nudging the
            range label or the arrows.
          - All three buttons forced to h-9 so the row height stays 36px
            regardless of whether Today is rendered (tertiary's intrinsic
            height is 32px, secondary's is 36px — without h-9 the row
            stuttered between the two when Today toggled). */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3">
        <div className="flex items-center gap-2 justify-self-start">
          <Button className="h-9" variant="tertiary" onClick={onPrev} aria-label="Previous days">←</Button>
          {onJumpToToday && (
            <Button variant="secondary" onClick={onJumpToToday}>Today</Button>
          )}
        </div>
        <span className="text-sm font-medium text-slate-600 dark:text-gray-400 select-none truncate text-center">
          {days.length > 0 && days[0].toLocaleDateString('default', { month: 'short', day: 'numeric' })}
          {days.length > 1 && ` – ${days[days.length - 1].toLocaleDateString('default', { month: 'short', day: 'numeric' })}`}
        </span>
        <Button className="h-9 justify-self-end" variant="tertiary" onClick={onNext} aria-label="Next days">→</Button>
      </div>

      {/* Day columns */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((date) => {
          const key = toDateKey(date)
          const workouts = workoutsByDate[key] ?? []
          const visible = workouts.slice(0, MAX_VISIBLE)
          const overflow = workouts.length - MAX_VISIBLE
          const isToday = key === todayKey
          const isSelected = key === selectedDate

          return (
            <div
              key={key}
              className={[
                'group rounded-lg border p-2 flex flex-col min-h-[160px] transition-colors',
                isSelected
                  ? 'border-primary ring-2 ring-primary'
                  : 'border-slate-200 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-900',
              ].join(' ')}
            >
              {/* Day header */}
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-slate-500 dark:text-gray-400 uppercase tracking-wide">
                    {DAY_LABELS[date.getDay()]}
                  </span>
                  <span
                    className={[
                      'text-sm w-7 h-7 flex items-center justify-center rounded-full font-medium',
                      isToday ? 'bg-primary text-white' : 'text-slate-700 dark:text-gray-200',
                    ].join(' ')}
                  >
                    {date.getDate()}
                  </span>
                </div>
                <button
                  onClick={() => onAddClick(key)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 text-base leading-none w-7 h-7 flex items-center justify-center rounded"
                  aria-label={`Add workout on ${key}`}
                >
                  +
                </button>
              </div>

              {/* Workout list */}
              <div className="flex-1 min-h-0 flex flex-col gap-1 overflow-hidden">
                {visible.map((w) => {
                  const styles = WORKOUT_TYPE_STYLES[w.type]
                  return (
                    <button
                      key={w.id}
                      onClick={() => onWorkoutClick(key, w.id)}
                      title={w.title}
                      className={`w-full min-h-[28px] flex items-center gap-1 px-1.5 py-1 rounded text-left hover:bg-slate-100 dark:hover:bg-gray-800/70 transition-colors border-l-2 ${styles?.accentBar ?? 'border-slate-300 dark:border-gray-700'}`}
                    >
                      <span className={['text-[10px] shrink-0', w.status === 'PUBLISHED' ? 'text-green-400' : 'text-yellow-400'].join(' ')}>
                        {w.status === 'PUBLISHED' ? '●' : '○'}
                      </span>
                      <span className={`text-[10px] font-mono ${styles?.tint ?? 'text-slate-500 dark:text-gray-400'} shrink-0 w-4`}>
                        {styles?.abbr ?? '?'}
                      </span>
                      <span className="text-[10px] text-slate-700 dark:text-gray-200 truncate flex-1">{w.title}</span>
                    </button>
                  )
                })}
              </div>

              {overflow > 0 && (
                <div className="text-[10px] text-slate-500 dark:text-gray-400 pl-1 shrink-0 mt-0.5">+{overflow} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
