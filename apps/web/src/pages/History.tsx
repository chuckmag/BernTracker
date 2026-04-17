import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, TYPE_ABBR, type HistoryResult, type WorkoutLevel, type WorkoutType } from '../lib/api.ts'

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatResultValue(result: HistoryResult): string {
  const v = result.value
  const type = result.workout.type as WorkoutType

  if (type === 'AMRAP') {
    return `${v.rounds as number} rounds + ${v.reps as number} reps`
  }
  if (type === 'FOR_TIME') {
    if (v.cappedOut) return 'CAPPED'
    return formatSeconds(v.seconds as number)
  }
  return '—'
}

function monthKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function History() {
  const navigate = useNavigate()
  const [results, setResults] = useState<HistoryResult[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.results.history(page)
      .then((data) => { if (!cancelled) { setResults(data.results); setPages(data.pages) } })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page])

  // Group results by month
  const groups: { month: string; rows: HistoryResult[] }[] = []
  for (const r of results) {
    const month = monthKey(r.workout.scheduledAt)
    const last = groups[groups.length - 1]
    if (last && last.month === month) {
      last.rows.push(r)
    } else {
      groups.push({ month, rows: [r] })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">History</h1>

      {loading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && results.length === 0 && (
        <p className="text-sm text-gray-500">No results logged yet.</p>
      )}

      {groups.map(({ month, rows }) => (
        <div key={month}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{month}</h2>
            <hr className="flex-1 border-gray-800" />
          </div>
          <div className="space-y-1">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/workouts/${r.workout.id}`, { state: { from: 'history' } })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs text-gray-500 w-14 shrink-0">{shortDate(r.workout.scheduledAt)}</span>
                <span className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 text-xs font-bold text-gray-400 shrink-0">
                  {TYPE_ABBR[r.workout.type]}
                </span>
                <span className="flex-1 text-sm font-medium text-white truncate">{r.workout.title}</span>
                <span className="font-mono text-sm text-gray-300 shrink-0">{formatResultValue(r)}</span>
                <span className="text-xs text-gray-500 w-16 text-right shrink-0">{LEVEL_LABELS[r.level]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500">Page {page} of {pages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pages}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
