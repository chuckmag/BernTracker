import type { ConsistencyData } from '../lib/api.ts'
import { useTheme } from '../context/ThemeContext.tsx'
import { resolveTheme } from '../lib/useTheme.ts'
import { BRAND_TOKENS } from '../lib/designTokens.ts'

const CELL_COLORS = [
  'bg-slate-100 dark:bg-gray-800',  // 0 — empty
  'bg-primary/20',  // 1
  'bg-primary/50',  // 2
  'bg-primary',     // 3+
]

// Raw hex values for legend swatches — computed from BRAND_TOKENS primary
// at 20% / 50% / 100% opacity blended onto white (light) or gray-900 (dark).
const LEGEND_COLORS_LIGHT = ['#f1f5f9', '#D2DEEE', '#8FADD4', BRAND_TOKENS.light.primary]
const LEGEND_COLORS_DARK  = ['#1f2937', '#1F324D', '#365A87', BRAND_TOKENS.dark.primary]

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
  isDark: boolean
}

function StreakRing({ current, best, size = 64, isDark }: StreakRingProps) {
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const progress = best > 0 ? Math.min(current / best, 1) : 0
  const dashOffset = circumference * (1 - progress)
  const cx = size / 2
  const cy = size / 2

  const trackColor   = isDark ? '#1f2937' : '#e2e8f0'  // gray-800 | slate-200
  const fillColor    = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const textFill     = isDark ? '#ffffff' : '#020617'  // white | slate-950

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} aria-label={`Current streak: ${current} days`} role="img">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={trackColor} strokeWidth={7} />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={fillColor}
          strokeWidth={7}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={textFill} fontSize={size < 60 ? 14 : 18} fontWeight="700">
          {current}
        </text>
      </svg>
      <span className="text-xs text-slate-500 dark:text-gray-400">streak</span>
      <span className="text-xs text-slate-400 dark:text-gray-500">Best: {best}d</span>
    </div>
  )
}

interface WorkoutDaysHeatmapProps {
  history: ConsistencyData['history']
  weeks?: number
  isDark: boolean
}

const WEEKS = 16

function WorkoutDaysHeatmap({ history, weeks = WEEKS, isDark }: WorkoutDaysHeatmapProps) {
  const countByDate: Record<string, number> = {}
  for (const { date, count } of history) {
    countByDate[date] = count
  }

  const today = new Date()
  const todayUtc = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
  const dayOfWeek = today.getUTCDay()
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

  const legendColors = isDark ? LEGEND_COLORS_DARK : LEGEND_COLORS_LIGHT

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
                  isToday ? 'ring-1 ring-primary ring-offset-1 ring-offset-white dark:ring-offset-gray-900' : '',
                ].join(' ')}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-1" aria-hidden="true">
        <span className="text-[10px] text-slate-400 dark:text-gray-500">Less</span>
        {legendColors.map((color, i) => (
          <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        ))}
        <span className="text-[10px] text-slate-400 dark:text-gray-500">More</span>
      </div>
    </div>
  )
}

interface ConsistencyCardProps {
  data: ConsistencyData
  weeks?: number
}

export default function ConsistencyCard({ data, weeks = WEEKS }: ConsistencyCardProps) {
  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Consistency</h2>
        <span className="text-xs text-slate-400 dark:text-gray-500">Last {weeks} weeks</span>
      </div>

      <div className="flex items-start gap-6">
        <StreakRing current={data.currentStreak} best={data.longestStreak} size={64} isDark={isDark} />
        <WorkoutDaysHeatmap history={data.history} weeks={weeks} isDark={isDark} />
      </div>
    </div>
  )
}
