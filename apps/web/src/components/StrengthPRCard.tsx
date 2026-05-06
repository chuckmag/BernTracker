import { useEffect, useRef, useState } from 'react'
import { api, type TrackedMovement, type StrengthTrajectoryData } from '../lib/api.ts'
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

function TrajectoryChart({ points }: { points: StrengthTrajectoryData['points'] }) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[108px] text-sm text-gray-500">
        No load data in this range
      </div>
    )
  }
  if (points.length === 1) {
    return (
      <div className="flex items-center justify-center h-[108px] text-sm text-gray-500">
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

  const toX = (_i: number) => PAD.left + (_i / (points.length - 1)) * innerW
  const toY = (load: number) => PAD.top + innerH - ((load - minLoad) / loadRange) * innerH

  const polylinePoints = points.map((p, i) => `${toX(i)},${toY(p.maxLoad)}`).join(' ')

  // Y axis ticks (2-3)
  const yTicks = [minLoad, Math.round((minLoad + maxLoad) / 2), maxLoad]

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + PAD.top + PAD.bottom}`}
      aria-label="Strength PR trajectory chart"
      role="img"
    >
      {/* Y axis ticks */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left - 4}
            y1={toY(v)}
            x2={CHART_WIDTH - PAD.right}
            y2={toY(v)}
            stroke="#1f2937"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={toY(v)}
            textAnchor="end"
            dominantBaseline="central"
            fill="#6b7280"
            fontSize={9}
          >
            {Math.round(v)}
          </text>
        </g>
      ))}

      {/* Line */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={toX(i)} cy={toY(p.maxLoad)} r={3} fill="#6366f1" />
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
        positive ? 'bg-emerald-900/60 text-emerald-400' : 'bg-rose-900/60 text-rose-400',
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

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setTrajectory(null)
    api.me.analytics.strengthTrajectory(selectedId, range)
      .then(setTrajectory)
      .finally(() => setLoading(false))
  }, [selectedId, range])

  // Roving tabindex for radio group
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
    <div className="bg-gray-900 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Strength PRs</h2>
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
                  isSelected ? 'text-white' : 'text-gray-400 hover:text-gray-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0',
                    isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-600',
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
                    <span className="text-xl font-bold text-white">
                      {trajectory.currentPr} {trajectory.loadUnit}
                    </span>
                    <span className="text-xs text-gray-500">current PR</span>
                    <ImprovementChip points={trajectory.points} />
                  </>
                ) : (
                  <span className="text-sm text-gray-500">No data yet</span>
                )}
              </div>
              <TrajectoryChart points={trajectory.points} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
