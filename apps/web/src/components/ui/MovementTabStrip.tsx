interface MovementTabStripProps {
  movements: { workoutMovementId: string; movementName: string }[]
  active: number
  onChange: (idx: number) => void
  className?: string
}

export default function MovementTabStrip({ movements, active, onChange, className = '' }: MovementTabStripProps) {
  if (movements.length <= 1) return null
  return (
    <div
      className={`flex gap-1 overflow-x-auto -mx-1 px-1 ${className}`}
      role="tablist"
      aria-label="Movements"
    >
      {movements.map((m, i) => (
        <button
          key={m.workoutMovementId}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onChange(i)}
          className={[
            'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900',
            i === active
              ? 'bg-slate-200 dark:bg-gray-700 text-slate-950 dark:text-white'
              : 'bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
          ].join(' ')}
        >
          {m.movementName}
        </button>
      ))}
    </div>
  )
}
