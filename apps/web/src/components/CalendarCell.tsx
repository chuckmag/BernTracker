import { type Workout } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'

const MAX_VISIBLE = 3

interface CalendarCellProps {
  date: Date
  isToday: boolean
  workouts: Workout[]
  selected: boolean
  onAddClick: () => void
  onWorkoutClick: (id: string) => void
}

export default function CalendarCell({ date, isToday, workouts, selected, onAddClick, onWorkoutClick }: CalendarCellProps) {
  const visible = workouts.slice(0, MAX_VISIBLE)
  const overflow = workouts.length - MAX_VISIBLE

  return (
    <div
      className={[
        'group bg-white dark:bg-gray-950 h-[128px] p-1.5 flex flex-col transition-colors',
        selected ? 'ring-2 ring-inset ring-primary' : 'hover:bg-slate-50 dark:hover:bg-gray-900',
      ].join(' ')}
    >
      {/* Date row */}
      <div className="flex items-center justify-between mb-1 shrink-0">
        <span
          className={[
            'text-xs w-6 h-6 flex items-center justify-center rounded-full',
            isToday ? 'font-medium bg-primary text-white' : 'text-slate-500 dark:text-gray-400',
          ].join(' ')}
        >
          {date.getDate()}
        </span>
        <button
          onClick={onAddClick}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800 text-base leading-none w-7 h-7 flex items-center justify-center rounded"
          aria-label="Add workout"
        >
          +
        </button>
      </div>

      {/* Workout pills */}
      <div className="flex-1 min-h-0 flex flex-col gap-px overflow-hidden">
        {visible.map((w) => {
          const styles = WORKOUT_TYPE_STYLES[w.type]
          return (
            <button
              key={w.id}
              onClick={() => onWorkoutClick(w.id)}
              title={w.title}
              className={`w-full min-h-6 flex items-center gap-1 px-1 py-0.5 rounded text-left hover:bg-slate-100 dark:hover:bg-gray-800/70 transition-colors border-l-2 ${styles?.accentBar ?? 'border-slate-300 dark:border-gray-700'}`}
            >
              <span className={['text-[11px] shrink-0', w.status === 'PUBLISHED' ? 'text-green-400' : 'text-yellow-400'].join(' ')}>
                {w.status === 'PUBLISHED' ? '●' : '○'}
              </span>
              <span className={`text-[11px] font-mono ${styles?.tint ?? 'text-slate-500 dark:text-gray-400'} shrink-0 w-4`}>
                {styles?.abbr ?? '?'}
              </span>
              <span className="text-[11px] text-slate-700 dark:text-gray-200 truncate flex-1">{w.title}</span>
            </button>
          )
        })}
      </div>
      {overflow > 0 && (
        <div className="text-[11px] text-slate-500 dark:text-gray-400 pl-1 shrink-0">+{overflow} more</div>
      )}
    </div>
  )
}
