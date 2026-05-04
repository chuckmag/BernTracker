import { useState, useEffect, useCallback } from 'react'
import { type Role, type Workout } from '../lib/api'
import type { ProgramScope } from '../lib/programScope'
import CalendarCell from './CalendarCell'
import WorkoutDrawer from './WorkoutDrawer'
import Button from './ui/Button'

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface WorkoutCalendarBoardProps {
  /**
   * Loader for the visible month. Re-fires when the month changes or the
   * callback identity changes (parent owns filter state and re-binds the
   * closure when filters change). Returns workouts in [from, to].
   *
   * Required separately from `scope` because `ProgramScope.listWorkouts`
   * returns *all* workouts in a program — the calendar's per-month paging
   * needs a date range and, for the gym path, gym-wide filtering across
   * multiple programs. Wrapping that here lets each caller adapt freely.
   */
  loadWorkouts: (fromIso: string, toIso: string) => Promise<Workout[]>
  /** Forwarded to WorkoutDrawer — drives create/update/delete + program picker. */
  scope: ProgramScope
  /** Forwarded to WorkoutDrawer for the role-gated reorder controls. */
  userGymRole?: Role | null
  /** Forwarded to WorkoutDrawer's program picker default selection. */
  defaultProgramId?: string
}

/**
 * Reusable month-grid + drawer pair shared between `/calendar` (gym staff)
 * and the upcoming `/personal-program` page. Owns the visible-month state
 * and the workouts cache for that month; everything data-source-specific
 * (filters, gym scoping, program pinning) is supplied via props so the
 * same component can drive both surfaces without internal branching.
 */
export default function WorkoutCalendarBoard({
  loadWorkouts,
  scope,
  userGymRole,
  defaultProgramId,
}: WorkoutCalendarBoardProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)

  const reloadWorkouts = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true)
    setError(null)
    try {
      const from = new Date(year, month, 1).toISOString()
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
      const data = await loadWorkouts(from, to)
      if (!signal?.cancelled) setWorkouts(data)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }, [year, month, loadWorkouts])

  useEffect(() => {
    const signal = { cancelled: false }
    reloadWorkouts(signal)
    return () => { signal.cancelled = true }
  }, [reloadWorkouts])

  const workoutsByDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    // scheduledAt is UTC midnight — slice the ISO string to get the UTC calendar date,
    // avoiding a local-timezone shift that would bucket the workout a day early for US users.
    // (Ported from #213 when this logic moved out of Calendar.tsx.)
    const key = w.scheduledAt.slice(0, 10)
    if (!workoutsByDate[key]) workoutsByDate[key] = []
    workoutsByDate[key].push(w)
  }

  const workoutsOnDay = selectedDate ? (workoutsByDate[selectedDate] ?? []) : []
  const selectedWorkout = selectedWorkoutId
    ? workoutsOnDay.find((w) => w.id === selectedWorkoutId)
    : undefined

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
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
    setSelectedDate(null)
    setSelectedWorkoutId(null)
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
    setSelectedDate(null)
    setSelectedWorkoutId(null)
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-6">
        <Button variant="tertiary" onClick={prevMonth} aria-label="Previous month">←</Button>
        <span className="text-base font-medium w-44 text-center select-none">{monthLabel}</span>
        <Button variant="tertiary" onClick={nextMonth} aria-label="Next month">→</Button>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="grid grid-cols-7 mb-px">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div
        className={[
          'grid grid-cols-7 gap-px bg-gray-800 border border-gray-800 rounded-lg overflow-hidden',
          loading ? 'opacity-60 pointer-events-none' : '',
        ].join(' ')}
      >
        {weeks.map((week, wi) =>
          week.map((date, di) => {
            if (!date) {
              return <div key={`empty-${wi}-${di}`} className="bg-gray-950 h-[128px]" />
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
        scope={scope}
        dateKey={selectedDate}
        workout={selectedWorkout}
        workoutsOnDay={workoutsOnDay}
        userGymRole={userGymRole}
        defaultProgramId={defaultProgramId}
        onClose={() => { setSelectedDate(null); setSelectedWorkoutId(null) }}
        onSaved={() => { setSelectedDate(null); setSelectedWorkoutId(null); reloadWorkouts() }}
        onAutoSaved={() => { reloadWorkouts() }}
        onReordered={() => { reloadWorkouts() }}
        onWorkoutSelect={(id) => setSelectedWorkoutId(id)}
        onNewWorkout={() => setSelectedWorkoutId(null)}
      />
    </>
  )
}
