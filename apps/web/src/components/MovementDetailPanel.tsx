import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import {
  api,
  type MovementPrsData,
  type MovementTrajectoryData,
  type MovementPrType,
  type MovementLoadEntry,
  type MovementMaxRepsEntry,
  type MovementTimeEntry,
  type MovementDistanceEntry,
  type MovementCaloriesEntry,
} from '../lib/api.ts'
import Skeleton from './ui/Skeleton.tsx'
import SegmentedControl from './ui/SegmentedControl.tsx'
import ChartTooltip from './ui/ChartTooltip.tsx'
import Button from './ui/Button.tsx'
import { useTheme } from '../context/ThemeContext.tsx'
import { resolveTheme } from '../lib/useTheme.ts'
import { BRAND_TOKENS } from '../lib/designTokens.ts'

const PR_TYPE_LABELS: Record<MovementPrType, string> = {
  LOAD: 'Load PRs',
  MAX_REPS: 'Max Reps',
  TIME: 'Time',
  DISTANCE: 'Distance',
  CALORIES: 'Calories',
  NONE: 'None',
}

type Range = '1M' | '3M' | '6M' | '1Y'
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── PR Tables per type ──────────────────────────────────────────────────────

function LoadTable({ entries }: { entries: MovementLoadEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No load records yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Reps</th>
          <th className="pb-2 font-medium">Load</th>
          <th className="pb-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
        {entries.map((e) => (
          <tr key={`${e.repCount}-${e.achievedAt}`}>
            <td className="py-2 text-slate-950 dark:text-white">{e.repCount}RM</td>
            <td className="py-2 font-medium text-slate-950 dark:text-white">{e.load} {e.loadUnit}</td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{formatDate(e.achievedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MaxRepsTable({ entries }: { entries: MovementMaxRepsEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No max reps recorded yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Max Reps</th>
          <th className="pb-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.achievedAt}>
            <td className="py-2 font-medium text-slate-950 dark:text-white">{e.maxReps}</td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{formatDate(e.achievedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TimeTable({ entries }: { entries: MovementTimeEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No time records yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Distance</th>
          <th className="pb-2 font-medium">Time</th>
          <th className="pb-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
        {entries.map((e) => (
          <tr key={`${e.distance}-${e.achievedAt}`}>
            <td className="py-2 text-slate-950 dark:text-white">{e.distance} {e.distanceUnit}</td>
            <td className="py-2 font-medium text-slate-950 dark:text-white">{formatSeconds(e.seconds)}</td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{formatDate(e.achievedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DistanceTable({ entries }: { entries: MovementDistanceEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No distance records yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Time</th>
          <th className="pb-2 font-medium">Distance</th>
          <th className="pb-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
        {entries.map((e) => (
          <tr key={`${e.seconds}-${e.achievedAt}`}>
            <td className="py-2 text-slate-950 dark:text-white">{formatSeconds(e.seconds)}</td>
            <td className="py-2 font-medium text-slate-950 dark:text-white">{e.distance} {e.distanceUnit}</td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{formatDate(e.achievedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CaloriesTable({ entries }: { entries: MovementCaloriesEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate-500 dark:text-gray-400">No calorie records yet.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Time</th>
          <th className="pb-2 font-medium">Calories</th>
          <th className="pb-2 font-medium">Date</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
        {entries.map((e) => (
          <tr key={`${e.seconds}-${e.achievedAt}`}>
            <td className="py-2 text-slate-950 dark:text-white">{formatSeconds(e.seconds)}</td>
            <td className="py-2 font-medium text-slate-950 dark:text-white">{e.calories} cal</td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{formatDate(e.achievedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Trajectory chart ────────────────────────────────────────────────────────

interface TrajectoryChartProps {
  movementId: string
  prType: MovementPrType
  isDark: boolean
}

function TrajectoryChart({ movementId, prType, isDark }: TrajectoryChartProps) {
  const [data, setData] = useState<MovementTrajectoryData | null>(null)
  const [range, setRange] = useState<Range>('3M')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.me.analytics
      .movementTrajectory(movementId, prType, range)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movementId, prType, range])

  const primary = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const gridColor = isDark ? '#374151' : '#e2e8f0'
  const textColor = isDark ? '#9ca3af' : '#64748b'

  if (loading) return <Skeleton variant="feed-row" count={1} />

  if (!data || data.points.length < 2) {
    return <p className="text-xs text-slate-400 dark:text-gray-500">Not enough data to chart trajectory.</p>
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <SegmentedControl options={RANGES} value={range} onChange={setRange} />
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="achievedAt"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
            }
            tick={{ fontSize: 10, fill: textColor }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="value"
            tick={{ fontSize: 10, fill: textColor }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const pt = payload[0].payload as { achievedAt: string; value: number; label: string }
              return (
                <ChartTooltip
                  date={formatDate(pt.achievedAt)}
                  lines={[{ text: pt.label ?? String(pt.value), accent: true }]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Per-type panel (table + chart) ──────────────────────────────────────────

interface PrTypePanelProps {
  movementId: string
  prType: MovementPrType
  entries: MovementPrsData['byType'][string]['entries']
  isDark: boolean
}

function PrTypePanel({ movementId, prType, entries, isDark }: PrTypePanelProps) {
  return (
    <div className="space-y-5">
      <TrajectoryChart movementId={movementId} prType={prType} isDark={isDark} />
      <div>
        {prType === 'LOAD' && <LoadTable entries={entries as MovementLoadEntry[]} />}
        {prType === 'MAX_REPS' && <MaxRepsTable entries={entries as MovementMaxRepsEntry[]} />}
        {prType === 'TIME' && <TimeTable entries={entries as MovementTimeEntry[]} />}
        {prType === 'DISTANCE' && <DistanceTable entries={entries as MovementDistanceEntry[]} />}
        {prType === 'CALORIES' && <CaloriesTable entries={entries as MovementCaloriesEntry[]} />}
      </div>
    </div>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

interface Props {
  movementId: string
  name: string
  prTypes: MovementPrType[]
  onClose: () => void
}

export default function MovementDetailPanel({ movementId, name, prTypes, onClose }: Props) {
  const [prsData, setPrsData] = useState<MovementPrsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState<MovementPrType>(prTypes[0] ?? 'LOAD')
  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'

  useEffect(() => {
    setLoading(true)
    api.me.analytics
      .movementPrs(movementId)
      .then(setPrsData)
      .catch(() => setPrsData(null))
      .finally(() => setLoading(false))
  }, [movementId])

  const multiType = prTypes.length > 1

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="tertiary" onClick={onClose} aria-label="Back to movements">
          ← Back
        </Button>
        <h2 className="font-semibold text-slate-950 dark:text-white truncate">{name}</h2>
      </div>

      <div className="space-y-6">
        {loading && <Skeleton variant="feed-row" count={4} />}

        {!loading && prsData && (
          <>
            {/* Multi-type tab bar */}
            {multiType && (
              <div className="border-b border-slate-200 dark:border-gray-800">
                <nav className="flex gap-1">
                  {prTypes.map((pt) => (
                    <button
                      key={pt}
                      onClick={() => setActiveType(pt)}
                      className={[
                        'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                        activeType === pt
                          ? 'border-primary text-slate-950 dark:text-white'
                          : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
                      ].join(' ')}
                    >
                      {PR_TYPE_LABELS[pt]}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {/* PR panel for active type */}
            {prsData.byType[activeType] ? (
              <PrTypePanel
                movementId={movementId}
                prType={activeType}
                entries={prsData.byType[activeType].entries}
                isDark={isDark}
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">No records for this type.</p>
            )}

            {/* Recent appearances */}
            {prsData.recentAppearances.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-3">
                  Recent Appearances
                </h3>
                <ul className="space-y-2">
                  {prsData.recentAppearances.map((a) => (
                    <li key={a.workoutId} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-gray-300 truncate">{a.workoutName}</span>
                      <span className="ml-3 flex-shrink-0 text-slate-400 dark:text-gray-500">
                        {formatDate(a.scheduledAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {!loading && !prsData && (
          <p className="text-sm text-rose-400">Failed to load movement details.</p>
        )}
      </div>
    </div>
  )
}
