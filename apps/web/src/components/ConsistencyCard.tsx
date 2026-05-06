import type { ConsistencyData } from '../lib/api.ts'

const WEEKS = 16
const CELL_COLORS = [
  'bg-gray-800',    // 0
  'bg-indigo-900',  // 1
  'bg-indigo-700',  // 2
  'bg-indigo-500',  // 3+
]

function cellColor(count: number): string {
  if (count === 0) return CELL_COLORS[0]
  if (count === 1) return CELL_COLORS[1]
  if (count === 2) return CELL_COLORS[2]
  return CELL_COLORS[3]
}

interface StreakRingProps {
  current: number
  best: number
  size?: number
}

function StreakRing({ current, best, size = 64 }: StreakRingProps) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = best > 0 ? Math.min(current / best, 1) : 0
  const dashOffset = circumference * (1 - progress)
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} aria-label={`Current streak: ${current} days`} role="img">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={7} />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#6366f1"
          strokeWidth={7}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={size < 60 ? 14 : 18} fontWeight="700">
          {current}
        </text>
      </svg>
      <span className="text-xs text-gray-400">streak</span>
      <span className="text-xs text-gray-500">Best: {best}d</span>
    </div>
  )
}

interface WorkoutDaysHeatmapProps {
  history: ConsistencyData['history']
  weeks?: number
}

function WorkoutDaysHeatmap({ history, weeks = WEEKS }: WorkoutDaysHeatmapProps) {
  const countByDate: Record<string, number> = {}
  for (const { date, count } of history) {
    countByDate[date] = count
  }

  // Build cells: weeks columns × 7 rows. Start from Sunday of the current week.
  const today = new Date()
  const todayUtc = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
  const dayOfWeek = today.getUTCDay() // 0=Sun
  const startDate = new Date(today)
  startDate.setUTCDate(today.getUTCDate() - dayOfWeek - (weeks - 1) * 7)

  const columns: { dateKey: string; count: number; isToday: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: { dateKey: string; count: number; isToday: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate)
      cellDate.setUTCDate(startDate.getUTCDate() + w * 7 + d)
      const dateKey = `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, '0')}-${String(cellDate.getUTCDate()).padStart(2, '0')}`
      col.push({ dateKey, count: countByDate[dateKey] ?? 0, isToday: dateKey === todayUtc })
    }
    columns.push(col)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-0.5" aria-label="Workout days heatmap">
        {columns.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {col.map(({ dateKey, count, isToday }) => (
              <div
                key={dateKey}
                title={`${dateKey}: ${count} workout${count !== 1 ? 's' : ''}`}
                className={[
                  'w-3 h-3 rounded-sm',
                  cellColor(count),
                  isToday ? 'ring-1 ring-indigo-400 ring-offset-1 ring-offset-gray-900' : '',
                ].join(' ')}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1" aria-hidden="true">
        <span className="text-[10px] text-gray-500">Less</span>
        {CELL_COLORS.map((c, i) => (
          <div key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
        ))}
        <span className="text-[10px] text-gray-500">More</span>
      </div>
    </div>
  )
}

interface ConsistencyCardProps {
  data: ConsistencyData
  weeks?: number
}

export default function ConsistencyCard({ data, weeks = WEEKS }: ConsistencyCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Consistency</h2>
        <span className="text-xs text-gray-500">Last {weeks} weeks</span>
      </div>

      <div className="flex items-start gap-6">
        <StreakRing current={data.currentStreak} best={data.longestStreak} size={64} />
        <WorkoutDaysHeatmap history={data.history} weeks={weeks} />
      </div>
    </div>
  )
}
