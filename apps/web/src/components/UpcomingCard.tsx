import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Workout } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Skeleton from './ui/Skeleton'

const MAX_DAYS = 4

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const tomorrowKey = addDays(new Date(), 1).toISOString().slice(0, 10)
  if (dateKey === tomorrowKey) return 'TOMORROW'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

interface Props {
  gymId: string
}

export default function UpcomingCard({ gymId }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const tomorrow = addDays(new Date(), 1)
    tomorrow.setHours(0, 0, 0, 0)
    const end = addDays(new Date(), 6)
    end.setHours(23, 59, 59, 999)
    api.workouts.list(gymId, tomorrow.toISOString(), end.toISOString())
      .then((data) => setWorkouts(data.filter((w) => w.status === 'PUBLISHED')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [gymId])

  // Group by UTC date key, then take the first MAX_DAYS that have ≥1 workout
  const byDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    const key = w.scheduledAt.slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(w)
  }
  const days = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_DAYS)

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Coming up</span>
      </div>

      {loading && (
        <div className="p-4">
          <Skeleton variant="feed-row" count={2} />
        </div>
      )}

      {!loading && days.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-slate-400 dark:text-gray-500">Nothing scheduled in the next 5 days</p>
        </div>
      )}

      {!loading && days.map(([dateKey, dayWorkouts]) => (
        <div key={dateKey} className="border-b border-slate-200 dark:border-gray-800 last:border-b-0">
          <div className="px-4 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-gray-500">
              {formatDayLabel(dateKey)}
            </span>
          </div>
          {dayWorkouts.map((workout) => {
            const ts = WORKOUT_TYPE_STYLES[workout.type]
            return (
              <button
                key={workout.id}
                onClick={() => navigate(`/workouts/${workout.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-gray-800/40 transition-colors border-l-4 ${ts?.accentBar ?? 'border-slate-300 dark:border-gray-700'}`}
              >
                <span
                  className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${ts?.bg ?? 'bg-slate-200 dark:bg-gray-700'} ${ts?.tint ?? 'text-slate-500 dark:text-gray-400'}`}
                >
                  {ts?.abbr ?? '?'}
                </span>
                <span className="flex-1 min-w-0 text-sm text-slate-950 dark:text-white truncate">{workout.title}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
