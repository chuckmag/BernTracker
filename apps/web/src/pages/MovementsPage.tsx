import { useEffect, useState } from 'react'
import {
  api,
  type MovementsAnalyticsData,
  type MovementSummaryEntry,
  type MovementDisplayGroup,
  type MovementPrimaryPR,
  type MovementPrType,
} from '../lib/api.ts'
import Skeleton from '../components/ui/Skeleton.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import MovementDetailDrawer from '../components/MovementDetailDrawer.tsx'

const GROUP_LABELS: Record<MovementDisplayGroup, string> = {
  strength: 'Strength',
  monostructural: 'Monostructural',
  gymnastics: 'Gymnastics',
}

const PR_TYPE_LABELS: Record<MovementPrType, string> = {
  LOAD: 'Load',
  MAX_REPS: 'Max Reps',
  TIME: 'Time',
  DISTANCE: 'Distance',
  CALORIES: 'Calories',
  NONE: 'None',
}

function formatPR(pr: MovementPrimaryPR): string {
  switch (pr.type) {
    case 'LOAD':
      return `${pr.load} ${pr.loadUnit} × ${pr.reps}`
    case 'MAX_REPS':
      return `${pr.maxReps} reps`
    case 'TIME': {
      const m = Math.floor(pr.seconds / 60)
      const s = pr.seconds % 60
      return `${m}:${String(s).padStart(2, '0')} — ${pr.distance} ${pr.distanceUnit}`
    }
    case 'DISTANCE':
      return `${pr.distance} ${pr.distanceUnit}`
    case 'CALORIES':
      return `${pr.calories} cal`
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

interface MovementCardProps {
  entry: MovementSummaryEntry
  onSelect: (entry: MovementSummaryEntry) => void
}

function MovementCard({ entry, onSelect }: MovementCardProps) {
  const primaryPrType = entry.prTypes[0]

  return (
    <button
      onClick={() => onSelect(entry)}
      className="w-full text-left flex items-center justify-between px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
    >
      <div className="min-w-0">
        <div className="font-medium text-slate-950 dark:text-white truncate">{entry.name}</div>
        <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
          {primaryPrType && (
            <span className="text-slate-400 dark:text-gray-500">{PR_TYPE_LABELS[primaryPrType]}</span>
          )}
          {entry.primaryPR && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-gray-600">·</span>
              <span className="font-medium text-slate-700 dark:text-gray-300">{formatPR(entry.primaryPR)}</span>
            </>
          )}
          {!entry.primaryPR && <span className="text-slate-400 dark:text-gray-500">No PR recorded</span>}
        </div>
      </div>
      <div className="ml-4 flex-shrink-0 text-right">
        <div className="text-xs text-slate-400 dark:text-gray-500">{formatDate(entry.lastLoggedAt)}</div>
        <div className="text-slate-400 dark:text-gray-500 mt-1" aria-hidden="true">›</div>
      </div>
    </button>
  )
}

interface GroupSectionProps {
  group: MovementDisplayGroup
  entries: MovementSummaryEntry[]
  onSelect: (entry: MovementSummaryEntry) => void
}

function GroupSection({ group, entries, onSelect }: GroupSectionProps) {
  if (entries.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400 mb-3">
        {GROUP_LABELS[group]}
      </h2>
      <div className="space-y-2">
        {entries.map((e) => (
          <MovementCard key={e.movementId} entry={e} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

export default function MovementsPage() {
  const [data, setData] = useState<MovementsAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MovementSummaryEntry | null>(null)

  useEffect(() => {
    api.me.analytics
      .movements()
      .then(setData)
      .catch((e: Error) => setError(e.message ?? 'Failed to load movements'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton variant="feed-row" count={5} />

  if (error) return <p className="text-sm text-rose-400">{error}</p>

  const hasAny = data && (data.strength.length > 0 || data.monostructural.length > 0 || data.gymnastics.length > 0)

  if (!hasAny) {
    return (
      <EmptyState
        title="No movements logged yet"
        body="Your logged movements will appear here once you start tracking workouts."
      />
    )
  }

  return (
    <>
      <div className="space-y-8">
        {(['strength', 'monostructural', 'gymnastics'] as MovementDisplayGroup[]).map((g) => (
          <GroupSection key={g} group={g} entries={data![g]} onSelect={setSelected} />
        ))}
      </div>

      {selected && (
        <MovementDetailDrawer
          movementId={selected.movementId}
          name={selected.name}
          prTypes={selected.prTypes}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
