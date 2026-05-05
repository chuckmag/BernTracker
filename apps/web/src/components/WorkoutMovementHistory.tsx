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

// Repetition percentages of 1RM from strengthlevel.com
const E1RM_PCT: Record<number, number> = {
  1: 1.00, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
}

interface BestSet { reps: number; load: number; e1rm: number }

function bestE1RM(result: MovementHistoryResult): BestSet | null {
  let best: BestSet | null = null
  for (const set of result.movementSets) {
    if (set.load === undefined || !set.reps) continue
    const reps = parseInt(set.reps, 10)
    const pct = E1RM_PCT[reps]
    if (!pct) continue
    const e1rm = Math.round((set.load / pct) * 10) / 10
    if (best === null || e1rm > best.e1rm) best = { reps, load: set.load, e1rm }
  }
  return best
}

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

const STRENGTH_RM_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function StrengthPrTable({ entries, onClickEmpty }: { entries: StrengthPrEntry[]; onClickEmpty: (rm: number) => void }) {
  const byReps = new Map(entries.map((e) => [e.reps, e]))
  const unit = entries[0]?.unit ?? 'LB'
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
        PR Table · {unit}
      </p>
      <div className="flex gap-1 flex-wrap">
        {STRENGTH_RM_RANGE.map((reps) => {
          const entry = byReps.get(reps)
          return entry ? (
            <div
              key={reps}
              className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-gray-700 min-w-[3.5rem]"
            >
              <span className="text-[10px] text-gray-400">{reps}RM</span>
              <span className="text-sm font-semibold text-white">{entry.maxLoad}</span>
            </div>
          ) : (
            <button
              key={reps}
              type="button"
              onClick={() => onClickEmpty(reps)}
              title={`Log your ${reps}RM`}
              className="flex flex-col items-center px-3 py-2 rounded bg-gray-800 border border-dashed border-gray-600 min-w-[3.5rem] hover:border-indigo-500 hover:bg-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="text-[10px] text-gray-400">{reps}RM</span>
              <span className="text-sm font-semibold text-gray-600">???</span>
            </button>
          )
        })}
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

interface StrengthChartPoint {
  date: string
  fullDate: string
  effort: string   // e.g. "5 × 505"
  e1rm: number
}

function StrengthTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: StrengthChartPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 6, fontSize: 12, padding: '6px 10px' }}>
      <p style={{ color: '#e5e7eb', marginBottom: 4 }}>{p.fullDate}</p>
      <p style={{ color: '#818cf8' }}>{p.effort} lb</p>
      <p style={{ color: '#818cf8' }}>Est. 1RM: {p.e1rm} lb</p>
    </div>
  )
}

function StrengthChart({ results }: { results: MovementHistoryResult[] }) {
  // Results arrive newest-first; reverse to chronological for the trend line.
  const chartData: StrengthChartPoint[] = [...results]
    .reverse()
    .map((r) => {
      const best = bestE1RM(r)
      if (best === null) return null
      return {
        date: new Date(r.workout.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        fullDate: new Date(r.workout.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
        effort: `${best.reps} × ${best.load}`,
        e1rm: best.e1rm,
      }
    })
    .filter((d): d is StrengthChartPoint => d !== null)

  if (chartData.length < 2) return <p className="text-xs text-gray-500">Not enough data to chart.</p>
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} domain={['auto', 'auto']} unit=" lb" width={64} />
        <Tooltip content={<StrengthTooltip />} />
        <Line type="monotone" dataKey="e1rm" stroke="#818cf8" strokeWidth={2} dot={{ fill: '#818cf8', r: 3 }} />
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

function PrChart({ prTable, results }: { prTable: MovementPrTable; results: MovementHistoryResult[] }) {
  if (prTable.category === 'STRENGTH') return <StrengthChart results={results} />
  if (prTable.category === 'ENDURANCE') return <EnduranceChart prTable={prTable} />
  return <p className="text-xs text-gray-500">Chart not available for this movement type.</p>
}

// ─── PR Backfill Modal ────────────────────────────────────────────────────────

interface BackfillModalProps {
  movementId: string
  movementName: string
  rm: number
  onClose: () => void
  onSaved: () => void
}

function BackfillModal({ movementId, movementName, rm, onClose, onSaved }: BackfillModalProps) {
  const [load, setLoad] = useState('')
  const [dateStr, setDateStr] = useState(todayISODate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const loadNum = parseFloat(load)
    if (!load || isNaN(loadNum) || loadNum <= 0) {
      setError('Enter a valid load.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const workout = await api.me.personalProgram.workouts.create({
        title: `${movementName} ${rm}RM`,
        description: `${rm} × ${loadNum} lb`,
        type: 'STRENGTH',
        scheduledAt: `${dateStr}T12:00:00.000Z`,
        movementIds: [movementId],
      })
      await api.results.create(workout.id, {
        level: 'RX',
        workoutGender: 'OPEN',
        value: {
          movementResults: [{
            workoutMovementId: movementId,
            loadUnit: 'LB',
            sets: [{ reps: String(rm), load: loadNum }],
          }],
        },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-100">{rm}RM — {movementName}</h2>
          <p className="text-sm text-gray-500 mt-1">Log your max effort for this rep count</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bf-load" className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Load (lb)
          </label>
          <input
            id="bf-load"
            type="number"
            min="0"
            step="2.5"
            placeholder="e.g. 185"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 text-xl font-semibold placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bf-date" className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Date
          </label>
          <input
            id="bf-date"
            type="date"
            max={todayISODate()}
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
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
  const [pendingRm, setPendingRm] = useState<number | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    api.movements.myHistory(movementId, page)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movementId, page, historyKey])

  const hasPrTable =
    data &&
    (data.prTable.category === 'STRENGTH'
      ? true
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

  if (!data || (!hasPrTable && data.results.length === 0)) return null

  return (
    <div className="space-y-4 pt-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {movementName} — Your History
      </p>

      {hasPrTable && (
        <div className="rounded-lg bg-gray-900 border border-gray-800 px-4 py-3 space-y-4">
          {data.prTable.category === 'STRENGTH' && <StrengthPrTable entries={data.prTable.entries} onClickEmpty={setPendingRm} />}
          {data.prTable.category === 'ENDURANCE' && <EndurancePrTable entries={data.prTable.entries} />}
          {data.prTable.category === 'MACHINE' && <MachinePrTable prTable={data.prTable} />}

          {(data.prTable.category === 'STRENGTH' || data.prTable.category === 'ENDURANCE') && (
            <div>
              <button
                onClick={() => setShowChart((v) => !v)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showChart ? '▲ Hide trend' : `▼ ${data.prTable.category === 'STRENGTH' ? 'Est. 1RM trend' : 'Show trend'}`}
              </button>
              {showChart && (
                <div className="mt-3">
                  <PrChart prTable={data.prTable} results={data.results} />
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
      {pendingRm !== null && (
        <BackfillModal
          movementId={movementId}
          movementName={movementName}
          rm={pendingRm}
          onClose={() => setPendingRm(null)}
          onSaved={() => {
            setPendingRm(null)
            setHistoryKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
