import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Workout } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { useGym } from '../context/GymContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import BarbellIcon from '../components/icons/BarbellIcon.tsx'
import UsersIcon from '../components/icons/UsersIcon.tsx'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDayLabel(dateKey: string, todayKey: string): string {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const todayParts = todayKey.split('-').map(Number)
  const today = new Date(todayParts[0], todayParts[1] - 1, todayParts[2])
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (dateKey === todayKey) return 'TODAY'
  if (dateKey === toDateKey(tomorrow)) return 'TOMORROW'

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

export default function Feed() {
  const { gymId } = useGym()
  const { selected: programIds, available, clear: clearProgramFilter } = useProgramFilter()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const programIdsKey = programIds.join(',')

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 30)
    const to = new Date(today)
    to.setDate(today.getDate() + 14)
    to.setHours(23, 59, 59, 999)
    api.workouts.list(
      gymId,
      from.toISOString(),
      to.toISOString(),
      programIds.length ? { programIds } : undefined,
    )
      .then((data) => { if (!cancelled) setWorkouts(data.filter((w) => w.status === 'PUBLISHED')) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId, programIdsKey])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!gymId) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Feed</h1>
        <p className="text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  const today = new Date()
  const todayKey = toDateKey(today)

  const workoutsByDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    const key = toDateKey(new Date(w.scheduledAt))
    if (!workoutsByDate[key]) workoutsByDate[key] = []
    workoutsByDate[key].push(w)
  }

  const allKeys = Object.keys(workoutsByDate)
  const futureKeys = allKeys.filter((k) => k >= todayKey).sort()
  const pastKeys = allKeys.filter((k) => k < todayKey).sort().reverse()
  const sortedKeys = [...futureKeys, ...pastKeys]

  // Single-program filter gets a featured header (color stripe + name).
  // Multi-program gets a compact chip pointing at the picker.
  const singleProgram = programIds.length === 1
    ? available.find(({ program }) => program.id === programIds[0])?.program ?? null
    : null

  return (
    <div className="max-w-2xl mx-auto">
      {programIds.length > 0 && (
        <div className="mb-4">
          <Link
            to="/feed"
            onClick={(e) => { e.preventDefault(); clearProgramFilter() }}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← Back to all workouts
          </Link>
        </div>
      )}

      {singleProgram ? (
        <div className="flex items-start gap-3 mb-6">
          <div
            style={{ backgroundColor: singleProgram.coverColor ?? '#374151' }}
            className="w-1.5 h-10 rounded-full shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{singleProgram.name}</h1>
            <p className="text-xs uppercase tracking-wider text-gray-400 mt-0.5">Feed</p>
          </div>
        </div>
      ) : programIds.length > 1 ? (
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Feed</h1>
          <p className="text-xs uppercase tracking-wider text-gray-400 mt-1">
            Filtered to {programIds.length} programs
          </p>
        </div>
      ) : (
        <h1 className="text-2xl font-bold mb-6">Feed</h1>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {loading && <Skeleton variant="feed-row" count={4} />}

      {!loading && sortedKeys.length === 0 && (
        <EmptyState
          title="No published workouts"
          body="Nothing posted in the last 30 days."
        />
      )}

      <div className="space-y-8">
        {sortedKeys.map((dateKey) => (
          <div key={dateKey}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-semibold tracking-widest text-gray-400">
                {formatDayLabel(dateKey, todayKey)}
              </span>
              <hr className="flex-1 border-gray-800" />
            </div>

            <div className="space-y-2">
              {workoutsByDate[dateKey].map((workout) => {
                const styles = WORKOUT_TYPE_STYLES[workout.type]
                return (
                <button
                  key={workout.id}
                  onClick={() => navigate(`/workouts/${workout.id}`)}
                  className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-left group border-l-4 ${styles.accentBar}`}
                >
                  <span className={`shrink-0 mt-0.5 w-7 h-6 flex items-center justify-center rounded text-xs font-bold ${styles.bg} ${styles.tint}`}>
                    {styles.abbr}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white break-words">
                      {workout.title}
                    </span>
                    {workout.namedWorkout && (
                      <span className="text-xs text-indigo-400">● {workout.namedWorkout.name}</span>
                    )}
                    <FeedTileBadgeRow
                      logged={Boolean(workout.myResultId)}
                      resultCount={workout._count.results}
                    />
                  </span>
                  <span className="shrink-0 mt-0.5 text-gray-400 group-hover:text-white transition-colors">›</span>
                </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Meta-row beneath each feed tile's title. Renders the loaded/empty barbell
// (which encodes "you have logged a result here") and a `<users-icon> N`
// total-result count when at least one result exists.
function FeedTileBadgeRow({ logged, resultCount }: { logged: boolean; resultCount: number }) {
  if (!logged && resultCount === 0) return null
  return (
    <span className="mt-1.5 flex items-center gap-3 text-xs">
      <span className={logged ? 'text-indigo-400' : 'text-gray-500'}>
        <BarbellIcon
          loaded={logged}
          size={24}
          title={logged ? "You've logged a result" : 'No result logged yet'}
        />
      </span>
      {resultCount > 0 && (
        <span className="inline-flex items-center gap-1.5 text-gray-400" title={`${resultCount} result${resultCount === 1 ? '' : 's'} on the leaderboard`}>
          <UsersIcon size={16} />
          <span>{resultCount}</span>
        </span>
      )}
    </span>
  )
}
