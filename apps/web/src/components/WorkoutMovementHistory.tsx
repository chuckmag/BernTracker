import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { api } from '../lib/api.ts'
import type {
  MovementHistoryPage,
  MovementPrTable,
  StrengthPrEntry,
  EndurancePrEntry,
  MovementHistoryResult,
} from '../lib/api.ts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function describeSet(set: MovementHistoryResult['movementSets'][number], loadUnit?: string, distanceUnit?: string): string {
  const parts: string[] = []
  if (set.load !== undefined) {
    const unit = loadUnit ? ` ${loadUnit.toLowerCase()}` : ''
    parts.push(`${set.reps ?? '?'} × ${set.load}${unit}`)
  } else if (set.reps) {
    parts.push(`${set.reps} reps`)
  }
  if (set.distance !== undefined) {
    const unit = distanceUnit ? ` ${distanceUnit.toLowerCase()}` : ''
    parts.push(`${set.distance}${unit}`)
  }
  if (set.calories !== undefined) parts.push(`${set.calories} cal`)
  if (set.seconds !== undefined) parts.push(formatSeconds(set.seconds))
  return parts.join(' · ') || '—'
}

// ─── PR Table sub-components ──────────────────────────────────────────────────

function StrengthPrTable({ entries }: { entries: StrengthPrEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
        PR Table · {entries[0]?.unit ?? 'LB'}
      </p>
      <div className="flex gap-1 flex-wrap">
        {entries.map((e) => (
          <div
            key={e.reps}
            className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[3.5rem]"
          >
            <span className="text-[10px] text-gray-400">{e.reps}RM</span>
            <span className="text-sm font-semibold text-white">{e.maxLoad}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EndurancePrTable({ entries }: { entries: EndurancePrEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
        PR Table · Best Times
      </p>
      <div className="flex gap-1 flex-wrap">
        {entries.map((e) => {
          const label = `${e.distance} ${e.distanceUnit.toLowerCase()}`
          return (
            <div
              key={label}
              className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[4.5rem]"
            >
              <span className="text-[10px] text-gray-400 text-center">{label}</span>
              <span className="text-sm font-semibold text-white">{formatSeconds(e.bestSeconds)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type MachineView = 'all' | 'output' | 'time'

function MachinePrTable({ prTable }: { prTable: Extract<MovementPrTable, { category: 'MACHINE' }> }) {
  const [view, setView] = useState<MachineView>('all')

  const calOutput = prTable.outputCapped.calories
  const distOutput = prTable.outputCapped.distance
  const calTime = prTable.timeCapped.calories
  const distTime = prTable.timeCapped.distance

  const hasOutput = calOutput.length > 0 || distOutput.length > 0
  const hasTime = calTime.length > 0 || distTime.length > 0
  const hasAny = hasOutput || hasTime

  if (!hasAny) return null

  const showOutput = view === 'all' || view === 'output'
  const showTime = view === 'all' || view === 'time'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">PR Table</p>
        {hasOutput && hasTime && (
          <div role="radiogroup" aria-label="Machine PR view" className="flex gap-1 ml-auto">
            {(['all', 'output', 'time'] as MachineView[]).map((v) => (
              <button
                key={v}
                role="radio"
                aria-checked={view === v}
                onClick={() => setView(v)}
                className={[
                  'text-[10px] px-2 py-0.5 rounded font-medium transition-colors',
                  view === v
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200',
                ].join(' ')}
              >
                {v === 'all' ? 'All' : v === 'output' ? 'Output target' : 'Time target'}
              </button>
            ))}
          </div>
        )}
      </div>

      {showOutput && calOutput.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Output-capped — best time</p>
          <div className="flex gap-1 flex-wrap">
            {calOutput.map((e) => (
              <div key={e.calories} className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[4rem]">
                <span className="text-[10px] text-gray-400">{e.calories} cal</span>
                <span className="text-sm font-semibold text-white">{formatSeconds(e.bestSeconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showOutput && distOutput.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Output-capped — best time</p>
          <div className="flex gap-1 flex-wrap">
            {distOutput.map((e) => (
              <div key={`${e.distance}${e.distanceUnit}`} className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[4.5rem]">
                <span className="text-[10px] text-gray-400">{e.distance} {e.distanceUnit.toLowerCase()}</span>
                <span className="text-sm font-semibold text-white">{formatSeconds(e.bestSeconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTime && calTime.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Time-capped — best output</p>
          <div className="flex gap-1 flex-wrap">
            {calTime.map((e) => (
              <div key={e.seconds} className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[4rem]">
                <span className="text-[10px] text-gray-400">{formatSeconds(e.seconds)}</span>
                <span className="text-sm font-semibold text-white">{e.bestCalories} cal</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTime && distTime.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Time-capped — best output</p>
          <div className="flex gap-1 flex-wrap">
            {distTime.map((e) => (
              <div key={e.seconds} className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[4.5rem]">
                <span className="text-[10px] text-gray-400">{formatSeconds(e.seconds)}</span>
                <span className="text-sm font-semibold text-white">{e.bestDistance} {e.distanceUnit.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chart sub-component ──────────────────────────────────────────────────────

function StrengthChart({ prTable }: { prTable: Extract<MovementPrTable, { category: 'STRENGTH' }> }) {
  const data = prTable.entries.map((e) => ({
    label: `${e.reps}RM`,
    load: e.maxLoad,
  }))
  if (data.length < 2) return <p className="text-xs text-gray-500">Not enough data to chart.</p>
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#e5e7eb' }}
          itemStyle={{ color: '#818cf8' }}
        />
        <Line type="monotone" dataKey="load" stroke="#818cf8" strokeWidth={2} dot={{ fill: '#818cf8', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function EnduranceChart({ prTable }: { prTable: Extract<MovementPrTable, { category: 'ENDURANCE' }> }) {
  const data = prTable.entries.map((e) => ({
    label: `${e.distance}${e.distanceUnit.toLowerCase()}`,
    seconds: e.bestSeconds,
  }))
  if (data.length < 2) return <p className="text-xs text-gray-500">Not enough data to chart.</p>
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tickFormatter={formatSeconds} tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: '#e5e7eb' }}
          formatter={(v) => [formatSeconds(Number(v)), 'Time']}
        />
        <Line type="monotone" dataKey="seconds" stroke="#818cf8" strokeWidth={2} dot={{ fill: '#818cf8', r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function PrChart({ prTable }: { prTable: MovementPrTable }) {
  if (prTable.category === 'STRENGTH') return <StrengthChart prTable={prTable} />
  if (prTable.category === 'ENDURANCE') return <EnduranceChart prTable={prTable} />
  return <p className="text-xs text-gray-500">Chart not available for this movement type.</p>
}

// ─── Past result card ─────────────────────────────────────────────────────────

interface PastResultCardProps {
  result: MovementHistoryResult
  currentWorkoutId: string
  onClick: () => void
}

function PastResultCard({ result, onClick }: PastResultCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors overflow-hidden"
    >
      <div className="px-3 py-2 text-sm font-medium text-gray-200 border-b border-gray-800">
        {formatDate(result.workout.scheduledAt)}
      </div>
      <div className="px-3 py-2 bg-gray-800/50">
        <p className="text-xs font-medium text-gray-300 mb-1.5 truncate">{result.workout.title}</p>
        <ol className="space-y-0.5">
          {result.movementSets.slice(0, 6).map((set, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs text-gray-300">
              <span className="text-gray-500 font-mono w-6 shrink-0 text-right">{i + 1}</span>
              <span className="font-mono">{describeSet(set, result.loadUnit, result.distanceUnit)}</span>
            </li>
          ))}
          {result.movementSets.length > 6 && (
            <li className="text-xs text-gray-500 pl-8">+{result.movementSets.length - 6} more sets</li>
          )}
        </ol>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  movementId: string
  movementName: string
  currentWorkoutId: string
}

export default function WorkoutMovementHistory({ movementId, movementName, currentWorkoutId }: Props) {
  const navigate = useNavigate()
  const [data, setData] = useState<MovementHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [showChart, setShowChart] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    api.movements.myHistory(movementId, page)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movementId, page])

  const hasPrTable =
    data &&
    (data.prTable.category === 'STRENGTH'
      ? data.prTable.entries.length > 0
      : data.prTable.category === 'ENDURANCE'
        ? data.prTable.entries.length > 0
        : data.prTable.category === 'MACHINE'
          ? data.prTable.outputCapped.calories.length > 0 || data.prTable.outputCapped.distance.length > 0 || data.prTable.timeCapped.calories.length > 0 || data.prTable.timeCapped.distance.length > 0
          : false)

  if (loading && !data) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-4 w-24 bg-gray-800 rounded" />
        <div className="h-16 bg-gray-800 rounded" />
      </div>
    )
  }

  if (!data || (data.results.length === 0 && !hasPrTable)) return null

  return (
    <div className="space-y-4 pt-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {movementName} — Your History
      </p>

      {hasPrTable && (
        <div className="rounded-lg bg-gray-900 border border-gray-800 px-4 py-3 space-y-4">
          {data.prTable.category === 'STRENGTH' && <StrengthPrTable entries={data.prTable.entries} />}
          {data.prTable.category === 'ENDURANCE' && <EndurancePrTable entries={data.prTable.entries} />}
          {data.prTable.category === 'MACHINE' && <MachinePrTable prTable={data.prTable} />}

          {(data.prTable.category === 'STRENGTH' || data.prTable.category === 'ENDURANCE') && (
            <div>
              <button
                onClick={() => setShowChart((v) => !v)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showChart ? '▲ Hide chart' : '▼ Show chart'}
              </button>
              {showChart && (
                <div className="mt-3">
                  <PrChart prTable={data.prTable} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {data.results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Past Results</p>
          <div className="space-y-2">
            {data.results.map((r) => (
              <PastResultCard
                key={r.id}
                result={r}
                currentWorkoutId={currentWorkoutId}
                onClick={() =>
                  navigate(`/workouts/${r.workout.id}/results/${r.id}`, {
                    state: { from: 'movement-history', originWorkoutId: currentWorkoutId },
                  })
                }
              />
            ))}
          </div>

          {data.pages > 1 && (
            <div className="flex items-center gap-3 justify-center pt-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="text-xs text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-500">{page} / {data.pages}</span>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
                className="text-xs text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
