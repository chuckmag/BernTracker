import { useState, useEffect, useCallback } from 'react'
import { api, type Workout, type Movement } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import CalendarCell from '../components/CalendarCell'
import WorkoutDrawer from '../components/WorkoutDrawer'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { gymId, gymRole: userGymRole } = useGym()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)
  const [allMovements, setAllMovements] = useState<Movement[]>([])
  const [filterMovementIds, setFilterMovementIds] = useState<string[]>([])

  useEffect(() => {
    api.movements.list().then(setAllMovements).catch(() => {})
  }, [])

  const loadWorkouts = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const from = new Date(year, month, 1).toISOString()
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
      const data = await api.workouts.list(gymId, from, to, filterMovementIds.length ? filterMovementIds : undefined)
      if (!signal?.cancelled) setWorkouts(data)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [gymId, year, month, filterMovementIds])

  useEffect(() => {
    const signal = { cancelled: false }
    loadWorkouts(signal)
    return () => { signal.cancelled = true }
  }, [loadWorkouts])

  const workoutsByDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    const key = toDateKey(new Date(w.scheduledAt))
    if (!workoutsByDate[key]) workoutsByDate[key] = []
    workoutsByDate[key].push(w)
  }

  const workoutsOnDay = selectedDate ? (workoutsByDate[selectedDate] ?? []) : []
  const selectedWorkout = selectedWorkoutId
    ? workoutsOnDay.find(w => w.id === selectedWorkoutId)
    : undefined

  // Build padded grid of Date | null
  const firstDayOfMonth = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = firstDayOfMonth.getDay()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const monthLabel = firstDayOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' })
  const todayKey = toDateKey(today)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
    setSelectedWorkoutId(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
    setSelectedWorkoutId(null)
  }

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Calendar</h1>
        <p className="text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800 transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-base font-medium w-44 text-center select-none">{monthLabel}</span>
          <button
            onClick={nextMonth}
            className="text-gray-400 hover:text-white px-3 py-1 rounded hover:bg-gray-800 transition-colors"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {/* Movement filter chips */}
      {allMovements.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {allMovements.map((m) => {
            const active = filterMovementIds.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() =>
                  setFilterMovementIds((prev) =>
                    active ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                  )
                }
                className={[
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
                ].join(' ')}
              >
                {m.name}
              </button>
            )
          })}
          {filterMovementIds.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterMovementIds([])}
              className="px-3 py-1 rounded-full text-xs font-medium bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-700 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-px">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className={[
          'grid grid-cols-7 gap-px bg-gray-800 border border-gray-800 rounded-lg overflow-hidden',
          loading ? 'opacity-60 pointer-events-none' : '',
        ].join(' ')}
      >
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            if (!date) {
              return <div key={`empty-${wi}-${di}`} className="bg-gray-950 h-24" />
            }
            const key = toDateKey(date)
            return (
              <CalendarCell
                key={key}
                date={date}
                isToday={key === todayKey}
                workouts={workoutsByDate[key] ?? []}
                selected={key === selectedDate}
                onAddClick={() => { setSelectedDate(key); setSelectedWorkoutId(null) }}
                onWorkoutClick={(id) => { setSelectedDate(key); setSelectedWorkoutId(id) }}
              />
            )
          }),
        )}
      </div>

      <WorkoutDrawer
        gymId={gymId}
        dateKey={selectedDate}
        workout={selectedWorkout}
        workoutsOnDay={workoutsOnDay}
        userGymRole={userGymRole}
        onClose={() => { setSelectedDate(null); setSelectedWorkoutId(null) }}
        onSaved={() => { setSelectedDate(null); setSelectedWorkoutId(null); loadWorkouts() }}
        onReordered={loadWorkouts}
        onWorkoutSelect={(id) => setSelectedWorkoutId(id)}
        onNewWorkout={() => setSelectedWorkoutId(null)}
      />
    </div>
  )
}
