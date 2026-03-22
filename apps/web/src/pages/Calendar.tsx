import { useState, useEffect, useCallback } from 'react'
import { api, type Workout } from '../lib/api'
import CalendarCell from '../components/CalendarCell'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const [gymId] = useState<string | null>(() => localStorage.getItem('gymId'))
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const loadWorkouts = useCallback(async () => {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const from = new Date(year, month, 1).toISOString()
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
      const data = await api.workouts.list(gymId, from, to)
      setWorkouts(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [gymId, year, month])

  useEffect(() => {
    loadWorkouts()
  }, [loadWorkouts])

  const workoutByDate: Record<string, Workout> = {}
  for (const w of workouts) {
    const key = toDateKey(new Date(w.scheduledAt))
    if (!workoutByDate[key]) workoutByDate[key] = w
  }

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
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
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
                workout={workoutByDate[key]}
                selected={key === selectedDate}
                onClick={() => setSelectedDate(key === selectedDate ? null : key)}
              />
            )
          }),
        )}
      </div>

      {/* TODO: WorkoutDrawer (Issue D) — rendered here, controlled by selectedDate */}
    </div>
  )
}
