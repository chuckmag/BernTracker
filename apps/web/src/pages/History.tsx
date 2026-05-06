import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ProgramFilterPicker from '../components/ProgramFilterPicker.tsx'
import { api, type HistoryResult, type WorkoutLevel, type WorkoutType } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { useMovements } from '../context/MovementsContext.tsx'
import { useProgramFilter, PERSONAL_PROGRAM_SENTINEL } from '../context/ProgramFilterContext.tsx'
import MovementFilterInput from '../components/MovementFilterInput.tsx'
import Button from '../components/ui/Button.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import { formatResultValue as formatValue } from '../lib/formatResult.ts'

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function formatResultValue(result: HistoryResult): string {
  return formatValue(result.value)
}

function monthKey(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function shortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function History() {
  const navigate = useNavigate()
  const allMovements = useMovements()
  const { selected, gymProgramIds, personalProgramId } = useProgramFilter()
  const [results, setResults] = useState<HistoryResult[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterMovementIds, setFilterMovementIds] = useState<string[]>([])

  // Resolve the effective program IDs to filter by, substituting the personal
  // program sentinel for the real DB id so the API receives only real ids.
  const historyProgramIds = useMemo(() => {
    if (selected.length === 0) return []
    const ids = [...gymProgramIds]
    if (selected.includes(PERSONAL_PROGRAM_SENTINEL) && personalProgramId) {
      ids.push(personalProgramId)
    }
    return ids
  }, [selected, gymProgramIds, personalProgramId])

  const filterProgramIdsKey = historyProgramIds.join(',')

  // Reset to page 1 when the program filter changes (skip on initial mount).
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    setPage(1)
  }, [filterProgramIdsKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.results.history(
      page,
      filterMovementIds.length ? filterMovementIds : undefined,
      historyProgramIds.length ? historyProgramIds : undefined,
    )
      .then((data) => { if (!cancelled) { setResults(data.results); setPages(data.pages) } })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, filterMovementIds, filterProgramIdsKey])  // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">History</h1>
        <ProgramFilterPicker variant="inline" />
      </div>

      {/* Movement filter */}
      {allMovements.length > 0 && (
        <div className="px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-800">
          <MovementFilterInput
            allMovements={allMovements}
            selectedIds={filterMovementIds}
            onChange={(ids) => { setPage(1); setFilterMovementIds(ids) }}
          />
        </div>
      )}

      {loading && <p className="text-slate-500 dark:text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && !error && results.length === 0 && (
        <EmptyState
          title="No results yet"
          body="Log your first result to start your history."
        />
      )}

      {groups.map(({ month, rows }) => (
        <div key={month}>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-widest">{month}</h2>
            <hr className="flex-1 border-slate-200 dark:border-gray-800" />
          </div>
          <div className="space-y-1">
            {rows.map((r) => {
              const styles = WORKOUT_TYPE_STYLES[r.workout.type as WorkoutType]
              return (
              <button
                key={r.id}
                onClick={() => navigate(`/workouts/${r.workout.id}`, { state: { from: 'history' } })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <span className="text-xs text-slate-500 dark:text-gray-400 w-14 shrink-0">{shortDate(r.workout.scheduledAt)}</span>
                <span className={`w-7 h-6 flex items-center justify-center rounded text-xs font-bold shrink-0 ${styles.bg} ${styles.tint}`}>
                  {styles.abbr}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-950 dark:text-white truncate">{r.workout.title}</span>
                <span className="font-mono text-sm text-slate-600 dark:text-gray-300 shrink-0">{formatResultValue(r)}</span>
                <span className="text-xs text-slate-500 dark:text-gray-400 w-16 text-right shrink-0">{LEVEL_LABELS[r.level]}</span>
              </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="tertiary" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            ← Prev
          </Button>
          <span className="text-xs text-slate-500 dark:text-gray-400">Page {page} of {pages}</span>
          <Button variant="tertiary" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
            Next →
          </Button>
        </div>
      )}
    </div>
  )
}
