import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type BenchmarkSummaryEntry,
  type WorkoutCategory,
} from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import Skeleton from '../components/ui/Skeleton.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import BenchmarkDetailPanel from '../components/BenchmarkDetailPanel.tsx'

const CATEGORY_ORDER: WorkoutCategory[] = ['GIRL_WOD', 'HERO_WOD', 'OPEN_WOD', 'GAMES_WOD', 'BENCHMARK']

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girls',
  HERO_WOD: 'Heroes',
  OPEN_WOD: 'Open',
  GAMES_WOD: 'Games',
  BENCHMARK: 'Benchmarks',
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

// ─── Benchmark card ───────────────────────────────────────────────────────────

interface CardProps {
  entry: BenchmarkSummaryEntry
  onSelect: (entry: BenchmarkSummaryEntry) => void
}

function BenchmarkCard({ entry, onSelect }: CardProps) {
  const attempted = entry.manualResultCount > 0 || entry.latestResult !== null
  const typeStyle = entry.templateWorkout ? WORKOUT_TYPE_STYLES[entry.templateWorkout.type] : null

  return (
    <button
      onClick={() => onSelect(entry)}
      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
    >
      <div className="min-w-0">
        <div className={`font-medium truncate ${attempted ? 'text-slate-950 dark:text-white' : 'text-slate-400 dark:text-gray-500'}`}>
          {entry.name}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {typeStyle && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeStyle.bg} ${typeStyle.tint}`}>
              {typeStyle.abbr}
            </span>
          )}
          {attempted && entry.latestResult && (
            <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
              {formatScore(entry.latestResult.primaryScoreKind, entry.latestResult.primaryScoreValue)}
            </span>
          )}
          {!attempted && (
            <span className="text-xs text-slate-400 dark:text-gray-600">Not attempted</span>
          )}
        </div>
      </div>
      <div className="ml-4 flex-shrink-0 text-slate-400 dark:text-gray-500" aria-hidden="true">
        ›
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BenchmarksPage() {
  const [data, setData] = useState<BenchmarkSummaryEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<BenchmarkSummaryEntry | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<WorkoutCategory>('GIRL_WOD')

  useEffect(() => {
    api.me.benchmarks
      .list()
      .then(setData)
      .catch((e: Error) => setError(e.message ?? 'Failed to load benchmarks'))
      .finally(() => setLoading(false))
  }, [])

  const grouped = useMemo<Record<WorkoutCategory, BenchmarkSummaryEntry[]> | null>(() => {
    if (!data) return null
    const q = query.trim().toLowerCase()
    const entries = q ? data.filter((e) => e.name.toLowerCase().includes(q)) : data

    const byCategory = Object.fromEntries(
      CATEGORY_ORDER.map((cat) => [cat, [] as BenchmarkSummaryEntry[]]),
    ) as Record<WorkoutCategory, BenchmarkSummaryEntry[]>

    for (const entry of entries) {
      if (byCategory[entry.category]) {
        byCategory[entry.category].push(entry)
      }
    }

    // Attempted first, then not-attempted; both groups alphabetical
    for (const cat of CATEGORY_ORDER) {
      byCategory[cat].sort((a, b) => {
        const aAttempted = (a.manualResultCount > 0 || a.latestResult !== null) ? 0 : 1
        const bAttempted = (b.manualResultCount > 0 || b.latestResult !== null) ? 0 : 1
        if (aAttempted !== bAttempted) return aAttempted - bAttempted
        return a.name.localeCompare(b.name)
      })
    }

    return byCategory
  }, [data, query])

  if (loading) return <Skeleton variant="feed-row" count={5} />

  if (error) return <p className="text-sm text-rose-400">{error}</p>

  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No benchmarks available"
        body="Named benchmark WODs will appear here once they're added to the library."
      />
    )
  }

  if (selected) {
    return (
      <BenchmarkDetailPanel
        entry={selected}
        onClose={() => setSelected(null)}
      />
    )
  }

  const activeEntries = grouped ? grouped[activeCategory] : []
  const totalFiltered = grouped
    ? CATEGORY_ORDER.reduce((sum, cat) => sum + grouped[cat].length, 0)
    : 0

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search benchmarks…"
        aria-label="Search benchmarks"
        className="w-full rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950"
      />

      <div className="border-b border-slate-200 dark:border-gray-800">
        <nav className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Benchmark category">
          {CATEGORY_ORDER.map((cat) => {
            const count = grouped ? grouped[cat].length : 0
            const isActive = cat === activeCategory
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(cat)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 whitespace-nowrap',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                  isActive
                    ? 'border-primary text-slate-950 dark:text-white'
                    : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
                ].join(' ')}
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                {count > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {query && totalFiltered === 0 ? (
        <p className="text-sm text-slate-500 dark:text-gray-400">
          No benchmarks match &ldquo;{query}&rdquo;
        </p>
      ) : activeEntries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-gray-400">
          No benchmarks in {CATEGORY_LABELS[activeCategory]}{query ? ` match "${query}"` : ''}.
        </p>
      ) : (
        <div className="space-y-2">
          {activeEntries.map((e) => (
            <BenchmarkCard key={e.id} entry={e} onSelect={setSelected} />
          ))}
        </div>
      )}
    </div>
  )
}
