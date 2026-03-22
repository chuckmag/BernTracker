import type { Workout } from '../lib/api'

const TYPE_LABELS: Record<string, string> = {
  AMRAP: 'AMRAP',
  FOR_TIME: 'For Time',
  EMOM: 'EMOM',
  STRENGTH: 'Strength',
  CARDIO: 'Cardio',
  METCON: 'MetCon',
  WARMUP: 'Warmup',
}

interface CalendarCellProps {
  date: Date
  isToday: boolean
  workout?: Workout
  selected: boolean
  onClick: () => void
}

export default function CalendarCell({ date, isToday, workout, selected, onClick }: CalendarCellProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-gray-950 h-24 p-1.5 cursor-pointer flex flex-col transition-colors',
        selected ? 'ring-2 ring-inset ring-indigo-500' : 'hover:bg-gray-900',
      ].join(' ')}
    >
      <span
        className={[
          'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 shrink-0',
          isToday ? 'bg-indigo-600 text-white' : 'text-gray-400',
        ].join(' ')}
      >
        {date.getDate()}
      </span>

      {workout && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="bg-indigo-900/50 border border-indigo-700/40 rounded px-1.5 py-0.5">
            <div className="text-xs text-indigo-300 font-medium truncate leading-tight">{workout.title}</div>
            <div className="text-[10px] text-indigo-400/70 truncate leading-tight">
              {TYPE_LABELS[workout.type] ?? workout.type}
              {workout.status === 'DRAFT' && (
                <span className="ml-1 text-yellow-500/80">· Draft</span>
              )}
            </div>
          </div>
          {workout._count.results > 0 && (
            <div className="mt-0.5 text-[10px] text-gray-500">
              {workout._count.results} result{workout._count.results !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
