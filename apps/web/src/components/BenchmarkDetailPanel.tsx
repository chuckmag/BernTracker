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
  type BenchmarkHistoryData,
  type BenchmarkHistoryEntry,
  type BenchmarkResult,
  type BenchmarkSummaryEntry,
  type WorkoutCategory,
} from '../lib/api.ts'
import Skeleton from './ui/Skeleton.tsx'
import Button from './ui/Button.tsx'
import ChartTooltip from './ui/ChartTooltip.tsx'
import MarkdownDescription from './MarkdownDescription.tsx'
import AddBenchmarkResultModal from './AddBenchmarkResultModal.tsx'
import { useTheme } from '../context/ThemeContext.tsx'
import { resolveTheme } from '../lib/useTheme.ts'
import { BRAND_TOKENS } from '../lib/designTokens.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girl WOD',
  HERO_WOD: 'Hero WOD',
  OPEN_WOD: 'Open WOD',
  GAMES_WOD: 'Games WOD',
  BENCHMARK: 'Benchmark',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatScore(kind: string | null, value: number | null): string {
  if (kind === null || value === null) return '—'
  switch (kind) {
    case 'TIME': {
      const m = Math.floor(value / 60)
      const s = Math.round(value % 60)
      return `${m}:${String(s).padStart(2, '0')}`
    }
    case 'ROUNDS_REPS': {
      const rounds = Math.floor(value / 1000)
      const reps = Math.round(value % 1000)
      return `${rounds} + ${reps}`
    }
    case 'LOAD':
      return `${Math.round(value * 10) / 10} kg`
    case 'DISTANCE':
      return `${Math.round(value)} m`
    case 'CALORIES':
      return `${Math.round(value)} cal`
    case 'REPS':
      return `${Math.round(value)} reps`
    default:
      return String(Math.round(value * 100) / 100)
  }
}

function scoreChartLabel(kind: string | null, value: number): string {
  return formatScore(kind, value)
}

function levelLabel(level: string): string {
  switch (level) {
    case 'RX_PLUS': return 'RX+'
    case 'RX': return 'RX'
    case 'SCALED': return 'Scaled'
    case 'MODIFIED': return 'Modified'
    default: return level
  }
}

// ─── Trend chart ─────────────────────────────────────────────────────────────

interface TrendChartProps {
  history: BenchmarkHistoryEntry[]
  isDark: boolean
}

function TrendChart({ history, isDark }: TrendChartProps) {
  const points = history
    .filter((h) => h.primaryScoreValue !== null)
    .map((h) => ({ achievedAt: h.achievedAt, value: h.primaryScoreValue as number }))
    .reverse() // ascending by date for chart

  if (points.length < 2) {
    return <p className="text-xs text-slate-400 dark:text-gray-500">Not enough data to chart trend.</p>
  }

  const kind = history.find((h) => h.primaryScoreKind !== null)?.primaryScoreKind ?? null
  const isTime = kind === 'TIME'

  const primary = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const gridColor = isDark ? '#374151' : '#e2e8f0'
  const textColor = isDark ? '#9ca3af' : '#64748b'

  return (
    <div>
      {isTime && (
        <p className="text-xs text-slate-400 dark:text-gray-500 mb-1">Lower is better</p>
      )}
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="achievedAt"
            tickFormatter={(v: string) =>
              new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
            }
            tick={{ fontSize: 10, fill: textColor }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="value"
            reversed={isTime}
            tick={{ fontSize: 10, fill: textColor }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => formatScore(kind, v)}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const pt = payload[0].payload as { achievedAt: string; value: number }
              return (
                <ChartTooltip
                  date={formatDate(pt.achievedAt)}
                  lines={[{ text: scoreChartLabel(kind, pt.value), accent: true }]}
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

// ─── History table ────────────────────────────────────────────────────────────

interface HistoryTableProps {
  history: BenchmarkHistoryEntry[]
}

function HistoryTable({ history }: HistoryTableProps) {
  if (!history.length) {
    return <p className="text-sm text-slate-500 dark:text-gray-400">No results logged yet.</p>
  }
  const kind = history.find((h) => h.primaryScoreKind !== null)?.primaryScoreKind ?? null

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
          <th className="pb-2 font-medium">Date</th>
          <th className="pb-2 font-medium">Score</th>
          <th className="pb-2 font-medium">Level</th>
          <th className="pb-2 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
        {history.map((h) => (
          <tr key={h.id}>
            <td className="py-2 text-slate-500 dark:text-gray-400 whitespace-nowrap">
              {formatDate(h.achievedAt)}
              {h.source === 'programmed' && (
                <span className="ml-1 text-xs text-slate-400 dark:text-gray-500">(class)</span>
              )}
            </td>
            <td className="py-2 font-medium text-slate-950 dark:text-white">
              {formatScore(kind, h.primaryScoreValue)}
            </td>
            <td className="py-2 text-slate-500 dark:text-gray-400">{levelLabel(h.level)}</td>
            <td className="py-2 text-slate-500 dark:text-gray-400 max-w-[140px] truncate" title={h.notes ?? undefined}>
              {h.notes ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  entry: BenchmarkSummaryEntry
  onClose: () => void
}

export default function BenchmarkDetailPanel({ entry, onClose }: Props) {
  const [historyData, setHistoryData] = useState<BenchmarkHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'

  useEffect(() => {
    setLoading(true)
    api.me.benchmarks
      .history(entry.id)
      .then(setHistoryData)
      .catch(() => setHistoryData(null))
      .finally(() => setLoading(false))
  }, [entry.id])

  function handleResultSaved(result: BenchmarkResult) {
    setShowModal(false)
    setHistoryData((prev) => {
      if (!prev) return prev
      const newEntry = {
        source: 'manual' as const,
        id: result.id,
        achievedAt: result.achievedAt,
        level: result.level,
        workoutGender: result.workoutGender,
        value: result.value,
        notes: result.notes,
        primaryScoreKind: result.primaryScoreKind,
        primaryScoreValue: result.primaryScoreValue,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }
      const updated = [newEntry, ...prev.history].sort(
        (a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
      )
      return { ...prev, history: updated }
    })
  }

  const tw = entry.templateWorkout
  const description = tw?.description?.trim() || entry.description?.trim() || ''
  const movements = tw?.workoutMovements ?? []
  const typeStyle = tw ? WORKOUT_TYPE_STYLES[tw.type] : null

  return (
    <>
      {showModal && (
        <AddBenchmarkResultModal
          namedWorkout={entry}
          onClose={() => setShowModal(false)}
          onSaved={handleResultSaved}
        />
      )}

      <div>
        {/* Back nav */}
        <div className="mb-4">
          <Button variant="tertiary" onClick={onClose} aria-label="Back to benchmarks">
            ← Back to Benchmarks
          </Button>
        </div>

        {/* Header — mirrors WodDetail title row */}
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            {typeStyle && (
              <span
                className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold ${typeStyle.bg} ${typeStyle.tint}`}
              >
                {typeStyle.abbr}
              </span>
            )}
            <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{entry.name}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
              {CATEGORY_LABELS[entry.category]}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {/* Description */}
          {description && (
            <div className="bg-white dark:bg-gray-900 rounded-lg px-4 py-3 border border-slate-200 dark:border-gray-800">
              <MarkdownDescription source={description} />
            </div>
          )}

          {/* Movements */}
          {movements.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {movements.map((wm) => (
                <span
                  key={wm.movement.id}
                  className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 border border-slate-200 dark:border-gray-700"
                >
                  {wm.movement.name}
                </span>
              ))}
            </div>
          )}

          {/* Source link */}
          {entry.sourceUrl && (
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
            >
              View source →
            </a>
          )}

          {loading && <Skeleton variant="feed-row" count={4} />}

          {!loading && historyData && (
            <>
              {/* Trend chart */}
              {historyData.history.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-3">
                    Trend
                  </h3>
                  <TrendChart history={historyData.history} isDark={isDark} />
                </section>
              )}

              {/* History */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                    Results
                  </h3>
                  <Button variant="accent" onClick={() => setShowModal(true)}>
                    + Add Result
                  </Button>
                </div>
                <HistoryTable history={historyData.history} />
              </section>
            </>
          )}

          {!loading && !historyData && (
            <div className="space-y-4">
              <p className="text-sm text-rose-400">Failed to load history.</p>
              <Button variant="accent" onClick={() => setShowModal(true)}>
                + Add Result
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
