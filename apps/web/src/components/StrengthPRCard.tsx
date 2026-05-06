import { useEffect, useRef, useState } from 'react'
import { api, type TrackedMovement, type StrengthTrajectoryData } from '../lib/api.ts'
import { useTheme } from '../context/ThemeContext.tsx'
import { resolveTheme } from '../lib/useTheme.ts'
import SegmentedControl from './ui/SegmentedControl.tsx'
import Skeleton from './ui/Skeleton.tsx'

type Range = '1M' | '3M' | '6M' | '1Y'
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
]

const CHART_WIDTH = 300
const CHART_HEIGHT = 100
const PAD = { top: 8, right: 8, bottom: 4, left: 32 }

interface TrajectoryChartProps {
  points: StrengthTrajectoryData['points']
  isDark: boolean
}

function TrajectoryChart({ points, isDark }: TrajectoryChartProps) {
  // SVG colors — mirror the indigo palette used in ConsistencyCard
  const lineColor  = isDark ? '#6366f1' : '#4f46e5'   // indigo-500 | indigo-600
  const dotColor   = lineColor
  const gridColor  = isDark ? '#1f2937' : '#e2e8f0'   // gray-800 | slate-200
  const tickColor  = isDark ? '#6b7280' : '#64748b'   // gray-500 | slate-500

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[108px] text-sm text-slate-500 dark:text-gray-400">
        No load data in this range
      </div>
    )
  }
  if (points.length === 1) {
    return (
      <div className="flex items-center justify-center h-[108px] text-sm text-slate-500 dark:text-gray-400">
        Only one data point — log more to see a trend
      </div>
    )
  }

  const loads = points.map((p) => p.maxLoad)
  const minLoad = Math.min(...loads)
  const maxLoad = Math.max(...loads)
  const loadRange = maxLoad - minLoad || 1

  const innerW = CHART_WIDTH - PAD.left - PAD.right
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const toY = (load: number) => PAD.top + innerH - ((load - minLoad) / loadRange) * innerH

  const polylinePoints = points.map((p, i) => `${toX(i)},${toY(p.maxLoad)}`).join(' ')
  const yTicks = [minLoad, Math.round((minLoad + maxLoad) / 2), maxLoad]

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + PAD.top + PAD.bottom}`}
      aria-label="Strength PR trajectory chart"
      role="img"
    >
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left - 4}
            y1={toY(v)}
            x2={CHART_WIDTH - PAD.right}
            y2={toY(v)}
            stroke={gridColor}
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={toY(v)}
            textAnchor="end"
            dominantBaseline="central"
            fill={tickColor}
            fontSize={9}
          >
            {Math.round(v)}
          </text>
        </g>
      ))}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.maxLoad)} r={3} fill={dotColor} />
      ))}
    </svg>
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
                      ? 'border-indigo-600 dark:border-indigo-500 bg-indigo-600 dark:bg-indigo-500'
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
              <TrajectoryChart points={trajectory.points} isDark={isDark} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
