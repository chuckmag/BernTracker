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
  workoutTitle: string
  myUserId: string
}

export default function LeaderboardCard({ workoutId, workoutTitle, myUserId }: Props) {
  const [entries, setEntries] = useState<WorkoutResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.results.leaderboard(workoutId)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workoutId])

  const top5 = entries.slice(0, 5)
  const myRank = entries.findIndex((e) => e.userId === myUserId)
  const myEntry = myRank >= 0 ? entries[myRank] : null
  const myRowBelow = myEntry && myRank >= 5

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
          Today · &ldquo;{workoutTitle}&rdquo;
        </span>
        <Link
          to={`/workouts/${workoutId}`}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0 ml-3"
        >
          Full board →
        </Link>
      </div>

      {loading && (
        <div className="p-4">
          <Skeleton variant="feed-row" count={3} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500">No results yet — be the first to log!</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div>
          {top5.map((entry, idx) => (
            <ResultRow key={entry.id} rank={idx + 1} entry={entry} isMe={entry.userId === myUserId} />
          ))}

          {myRowBelow && (
            <>
              <div className="px-4 py-0.5 text-center text-xs text-gray-600 tracking-widest border-t border-gray-800">
                ···
              </div>
              <ResultRow rank={myRank + 1} entry={myEntry} isMe />
            </>
          )}

          {!myEntry && (
            <p className="px-4 py-2.5 text-xs text-gray-600 text-center border-t border-gray-800">
              Log your result to appear on the board
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ rank, entry, isMe }: { rank: number; entry: WorkoutResult; isMe: boolean }) {
  const score = formatResultValue(entry.value)
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-indigo-950' : 'hover:bg-gray-800/40'} transition-colors`}
    >
      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-500">{rank}</span>
      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
        <span className="text-[10px] font-semibold text-gray-300">{initials(entry.user)}</span>
      </div>
      <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">{displayName(entry.user)}</span>
      <span
        className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-gray-400"
        aria-label={`Level: ${entry.level}`}
      >
        {LEVEL_LABEL[entry.level] ?? entry.level}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-gray-200">{score}</span>
    </div>
  )
}
