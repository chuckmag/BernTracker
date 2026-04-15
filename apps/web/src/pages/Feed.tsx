import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, TYPE_ABBR, type Workout } from '../lib/api.ts'

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
  const [gymId] = useState<string | null>(() => localStorage.getItem('gymId'))
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const loadWorkouts = useCallback(async () => {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const today = new Date()
      const from = new Date(today)
      from.setDate(today.getDate() - 30)
      const to = new Date(today)
      to.setDate(today.getDate() + 14)
      to.setHours(23, 59, 59, 999)
      const data = await api.workouts.list(gymId, from.toISOString(), to.toISOString())
      setWorkouts(data.filter((w) => w.status === 'PUBLISHED'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [gymId])

  useEffect(() => {
    loadWorkouts()
  }, [loadWorkouts])

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
      <h1 className="text-2xl font-bold mb-6">Feed</h1>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {loading && <p className="text-gray-400">Loading...</p>}

      {!loading && sortedKeys.length === 0 && (
        <p className="text-gray-400">No published workouts in the last 30 days.</p>
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
              {workoutsByDate[dateKey].map((workout) => (
                <button
                  key={workout.id}
                  onClick={() => navigate(`/workouts/${workout.id}`)}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-left group"
                >
                  <span className="shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded text-xs font-bold bg-gray-800 text-gray-300 group-hover:bg-gray-700">
                    {TYPE_ABBR[workout.type]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-white break-words">
                      {workout.title}
                    </span>
                    {workout.namedWorkout && (
                      <span className="text-xs text-indigo-400">● {workout.namedWorkout.name}</span>
                    )}
                  </span>
                  <span className="shrink-0 mt-0.5 text-gray-600 group-hover:text-gray-400 transition-colors">›</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
