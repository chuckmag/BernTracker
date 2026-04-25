import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type GymProgram, type Workout } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { useGym } from '../context/GymContext.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'

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
  const [searchParams] = useSearchParams()
  const programId = searchParams.get('programId') || undefined
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [program, setProgram] = useState<GymProgram | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProgram(null)
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - 30)
    const to = new Date(today)
    to.setDate(today.getDate() + 14)
    to.setHours(23, 59, 59, 999)
    const listPromise = api.workouts.list(gymId, from.toISOString(), to.toISOString(), programId ? { programId } : undefined)
    const programPromise = programId ? api.programs.get(programId) : Promise.resolve(null)
    Promise.all([listPromise, programPromise])
      .then(([data, p]) => {
        if (cancelled) return
        setWorkouts(data.filter((w) => w.status === 'PUBLISHED'))
        setProgram(p)
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId, programId])

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

  // Sort: today first, then future ascending, then past descending
  const allKeys = Object.keys(workoutsByDate)
  const futureKeys = allKeys.filter((k) => k >= todayKey).sort()
  const pastKeys = allKeys.filter((k) => k < todayKey).sort().reverse()
  const sortedKeys = [...futureKeys, ...pastKeys]

  return (
    <div className="max-w-2xl mx-auto">
      {programId && (
        <div className="mb-4">
          <Link to="/feed" className="text-xs text-indigo-400 hover:text-indigo-300">
            ← Back to all workouts
          </Link>
        </div>
      )}

      {programId && program ? (
        <div className="flex items-start gap-3 mb-6">
          <div
            style={{ backgroundColor: program.program.coverColor ?? '#374151' }}
            className="w-1.5 h-10 rounded-full shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{program.program.name}</h1>
            <p className="text-xs uppercase tracking-wider text-gray-400 mt-0.5">Feed</p>
          </div>
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
