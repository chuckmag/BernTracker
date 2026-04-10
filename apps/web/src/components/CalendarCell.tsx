import { TYPE_ABBR, type Workout } from '../lib/api'

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
      onClick={onAddClick}
      className={[
        'bg-gray-950 h-24 p-1.5 cursor-pointer flex flex-col transition-colors',
        selected ? 'ring-2 ring-inset ring-indigo-500' : 'hover:bg-gray-900',
      ].join(' ')}
    >
      {/* Date row */}
      <div className="flex items-center justify-between mb-1 shrink-0">
        <span
          className={[
            'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
            isToday ? 'bg-indigo-600 text-white' : 'text-gray-400',
          ].join(' ')}
        >
          {date.getDate()}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onAddClick() }}
          className="text-gray-600 hover:text-gray-300 text-sm leading-none w-5 h-5 flex items-center justify-center rounded transition-colors"
          aria-label="Add workout"
        >
          +
        </button>
      </div>

      {/* Workout pills */}
      <div className="flex-1 min-h-0 flex flex-col gap-px overflow-hidden">
        {visible.map((w) => (
          <button
            key={w.id}
            onClick={(e) => { e.stopPropagation(); onWorkoutClick(w.id) }}
            className="w-full flex items-center gap-1 px-1 py-0.5 rounded text-left hover:bg-gray-800/70 transition-colors"
          >
            <span className={['text-[10px] shrink-0', w.status === 'PUBLISHED' ? 'text-green-400' : 'text-yellow-400'].join(' ')}>
              {w.status === 'PUBLISHED' ? '●' : '○'}
            </span>
            <span className="text-[10px] font-mono text-indigo-400 shrink-0 w-3">
              {TYPE_ABBR[w.type] ?? '?'}
            </span>
            <span className="text-[10px] text-gray-200 truncate flex-1">{w.title}</span>
          </button>
        ))}
      </div>
      {overflow > 0 && (
        <div className="text-[10px] text-gray-500 pl-1 shrink-0">+{overflow} more</div>
      )}
    </div>
  )
}
