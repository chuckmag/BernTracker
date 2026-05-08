import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type WorkoutResult } from '../lib/api'
import { formatResultValue } from '../lib/formatResult'
import Skeleton from './ui/Skeleton'

const LEVEL_LABEL: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'SC',
  MODIFIED: 'MF',
}

function hotScore(r: WorkoutResult): number {
  return r._count.reactions + r._count.comments * 2
}

function initials(u: WorkoutResult['user']): string {
  if (u.firstName || u.lastName) {
    return `${(u.firstName ?? '')[0] ?? ''}${(u.lastName ?? '')[0] ?? ''}`.toUpperCase() || '?'
  }
  if (u.name) {
    const parts = u.name.trim().split(/\s+/)
    return `${parts[0][0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?'
  }
  return u.email[0].toUpperCase()
}

function displayName(u: WorkoutResult['user']): string {
  if (u.firstName || u.lastName) return [u.firstName, u.lastName].filter(Boolean).join(' ')
  return u.name ?? u.email.split('@')[0]
}

interface Props {
  workoutId: string
}

export default function HotTodayCard({ workoutId }: Props) {
  const [entries, setEntries] = useState<WorkoutResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.results.leaderboard(workoutId)
      .then((results) => {
        const sorted = [...results]
          .sort((a, b) => hotScore(b) - hotScore(a) || b._count.reactions - a._count.reactions)
          .slice(0, 3)
          .filter((r) => hotScore(r) > 0)
        setEntries(sorted)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workoutId])

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
          🔥 Hot Today
        </span>
        <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-0.5">most reacted results</p>
      </div>

      {loading && (
        <div className="p-4">
          <Skeleton variant="feed-row" count={3} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-slate-400 dark:text-gray-500">No reactions yet — be the first to cheer someone on</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div>
          {entries.map((entry) => (
            <HotRow key={entry.id} entry={entry} workoutId={workoutId} />
          ))}
        </div>
      )}
    </div>
  )
}

function HotRow({ entry, workoutId }: { entry: WorkoutResult; workoutId: string }) {
  const score = formatResultValue(entry.value)
  const totalReactions = entry._count.reactions
  const totalComments = entry._count.comments

  return (
    <Link
      to={`/workouts/${workoutId}`}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors"
    >
      <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-semibold text-slate-600 dark:text-gray-300">{initials(entry.user)}</span>
      </div>

      <div className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-950 dark:text-white truncate">{displayName(entry.user)}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-gray-400"
            aria-label={`Level: ${entry.level}`}
          >
            {LEVEL_LABEL[entry.level] ?? entry.level}
          </span>
          <span className="text-xs tabular-nums text-slate-500 dark:text-gray-400">{score}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {totalReactions > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-gray-400" aria-label={`${totalReactions} reactions`}>
            <span aria-hidden="true">🔥</span>
            <span className="tabular-nums">{totalReactions}</span>
          </span>
        )}
        {totalComments > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-gray-400" aria-label={`${totalComments} comments`}>
            <span aria-hidden="true">💬</span>
            <span className="tabular-nums">{totalComments}</span>
          </span>
        )}
      </div>
    </Link>
  )
}
