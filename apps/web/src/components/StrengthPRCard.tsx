import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Dot,
} from 'recharts'
import { api, type TrackedMovement, type StrengthTrajectoryData, type StrengthTrajectoryPoint } from '../lib/api.ts'
import { useTheme } from '../context/ThemeContext.tsx'
import { resolveTheme } from '../lib/useTheme.ts'
import { BRAND_TOKENS } from '../lib/designTokens.ts'
import SegmentedControl from './ui/SegmentedControl.tsx'
import Skeleton from './ui/Skeleton.tsx'
import ChartTooltip from './ui/ChartTooltip.tsx'

type Range = '1M' | '3M' | '6M' | '1Y'
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
]

function formatUtcDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatUtcShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

interface TrajectoryChartProps {
  points: StrengthTrajectoryData['points']
  isDark: boolean
  onClickPoint: (point: StrengthTrajectoryPoint) => void
}

interface ChartPoint {
  shortDate: string
  fullDate: string
  maxLoad: number
  effort: string
  loadUnit: string
  workoutId: string
  resultId: string
}

function TrajectoryTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <ChartTooltip
      date={p.fullDate}
      lines={[
        { text: `${p.effort} ${p.loadUnit}`, accent: true },
        { text: `Max: ${p.maxLoad} ${p.loadUnit}` },
      ]}
    />
  )
}

function TrajectoryChart({ points, isDark, onClickPoint }: TrajectoryChartProps) {
  const lineColor = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const gridColor = isDark ? '#1f2937' : '#e2e8f0'
  const tickColor = isDark ? '#6b7280' : '#64748b'

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-sm text-slate-500 dark:text-gray-400">
        No load data in this range
      </div>
    )
  }
  if (points.length === 1) {
    return (
      <div className="flex items-center justify-center h-[120px] text-sm text-slate-500 dark:text-gray-400">
        Only one data point — log more to see a trend
      </div>
    )
  }

  const chartData: ChartPoint[] = points.map((p) => ({
    shortDate: formatUtcShort(p.date),
    fullDate: formatUtcDate(p.date),
    maxLoad: p.maxLoad,
    effort: p.effort,
    loadUnit: p.loadUnit,
    workoutId: p.workoutId,
    resultId: p.resultId,
  }))

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
        <XAxis dataKey="shortDate" tick={{ fill: tickColor, fontSize: 10 }} />
        <YAxis tick={{ fill: tickColor, fontSize: 10 }} domain={['auto', 'auto']} width={40} />
        <Tooltip content={<TrajectoryTooltip />} />
        <Line
          type="monotone"
          dataKey="maxLoad"
          stroke={lineColor}
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props as { cx: number; cy: number; payload: ChartPoint }
            return (
              <Dot
                key={`dot-${payload.resultId}`}
                cx={cx}
                cy={cy}
                r={4}
                fill={lineColor}
                stroke="transparent"
                strokeWidth={8}
                style={{ cursor: 'pointer' }}
                onClick={() => onClickPoint(payload as unknown as StrengthTrajectoryPoint)}
              />
            )
          }}
          activeDot={{ r: 5, fill: lineColor, style: { cursor: 'pointer' } }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ImprovementChip({ points }: { points: StrengthTrajectoryData['points'] }) {
  if (points.length < 2) return null
  const first = points[0].maxLoad
  const last = points[points.length - 1].maxLoad
  const delta = last - first
  if (delta === 0) return null
  const positive = delta > 0
  return (
    <span
      className={[
        'text-xs px-1.5 py-0.5 rounded-full font-medium',
        positive
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
      ].join(' ')}
    >
      {positive ? '+' : ''}{delta} {points[0].loadUnit}
    </span>
  )
}

interface StrengthPRCardProps {
  movements: TrackedMovement[]
}

export default function StrengthPRCard({ movements }: StrengthPRCardProps) {
  const [selectedId, setSelectedId] = useState<string>(movements[0]?.movementId ?? '')
  const [range, setRange] = useState<Range>('3M')
  const [trajectory, setTrajectory] = useState<StrengthTrajectoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'
  const navigate = useNavigate()

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setTrajectory(null)
    api.me.analytics.strengthTrajectory(selectedId, range)
      .then(setTrajectory)
      .finally(() => setLoading(false))
  }, [selectedId, range])

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % movements.length
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + movements.length) % movements.length
    else return
    e.preventDefault()
    setSelectedId(movements[next].movementId)
    radioRefs.current[next]?.focus()
  }

  if (movements.length === 0) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Strength PRs</h2>
        <SegmentedControl
          options={RANGES}
          value={range}
          onChange={setRange}
        />
      </div>

      <div className="flex gap-5">
        {/* Radio buttons */}
        <div role="radiogroup" aria-label="Movement selection" className="flex flex-col gap-1.5 min-w-0">
          {movements.map((m, i) => {
            const isSelected = m.movementId === selectedId
            return (
              <button
                key={m.movementId}
                ref={(el) => { radioRefs.current[i] = el }}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setSelectedId(m.movementId)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                className={[
                  'flex items-center gap-2 text-left text-sm px-2 py-1 rounded transition-colors',
                  isSelected
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors',
                    isSelected
                      ? 'border-primary bg-primary'
                      : 'border-slate-300 dark:border-gray-600',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[160px]" title={m.name}>{m.name}</span>
              </button>
            )
          })}
        </div>

        {/* Chart + PR stat */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {loading && <Skeleton variant="feed-row" count={1} />}
          {!loading && trajectory && (
            <>
              <div className="flex items-baseline gap-2">
                {trajectory.currentPr !== null ? (
                  <>
                    <span className="text-xl font-bold text-slate-950 dark:text-white">
                      {trajectory.currentPr} {trajectory.loadUnit}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-gray-500">current PR</span>
                    <ImprovementChip points={trajectory.points} />
                  </>
                ) : (
                  <span className="text-sm text-slate-500 dark:text-gray-400">No data yet</span>
                )}
              </div>
              <TrajectoryChart
                points={trajectory.points}
                isDark={isDark}
                onClickPoint={(p) => navigate(`/workouts/${p.workoutId}/results/${p.resultId}`, { state: { from: 'wodalytics' } })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
