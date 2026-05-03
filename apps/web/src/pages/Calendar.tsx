import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api, type Workout } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import { useMovements } from '../context/MovementsContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import CalendarCell from '../components/CalendarCell'
import WorkoutDrawer from '../components/WorkoutDrawer'
import MovementFilterInput from '../components/MovementFilterInput'
import Button from '../components/ui/Button'
import Chip from '../components/ui/Chip'

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const { gymId, gymRole: userGymRole } = useGym()
  const scope = useMemo(
    () => makeGymProgramScope({ gymId: gymId ?? '', gymRole: userGymRole ?? null }),
    [gymId, userGymRole],
  )
  const allMovements = useMovements()
  const { selected: programIds, available, clear: clearProgramFilter } = useProgramFilter()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)
  const [filterMovementIds, setFilterMovementIds] = useState<string[]>([])

  const programIdsKey = programIds.join(',')

  const loadWorkouts = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const from = new Date(year, month, 1).toISOString()
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString()
      const filters = (filterMovementIds.length || programIds.length)
        ? {
            ...(filterMovementIds.length ? { movementIds: filterMovementIds } : {}),
            ...(programIds.length ? { programIds } : {}),
          }
        : undefined
      const data = await api.workouts.list(gymId, from, to, filters)
      if (!signal?.cancelled) setWorkouts(data)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId, year, month, filterMovementIds, programIdsKey])

  useEffect(() => {
    const signal = { cancelled: false }
    loadWorkouts(signal)
    return () => { signal.cancelled = true }
  }, [loadWorkouts])

  // Single-program filter gets a featured header (color stripe + name).
  // Multi-program gets a compact "Filtered to N programs" eyebrow.
  const singleProgram = programIds.length === 1
    ? available.find(({ program }) => program.id === programIds[0])?.program ?? null
    : null
  // First selected program is the create-mode default for new workouts; with
  // multi-select we can't pre-select an unambiguous default, so fall back to
  // the drawer's existing "first program in list" behavior beyond N=1.
  const defaultProgramIdForCreate = programIds.length === 1 ? programIds[0] : undefined

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
      {programIds.length > 0 && (
        <div className="mb-4">
          <Link
            to="/calendar"
            onClick={(e) => { e.preventDefault(); clearProgramFilter() }}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← Back to full calendar
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {singleProgram ? (
          <div className="flex items-start gap-3 min-w-0">
            <div
              style={{ backgroundColor: singleProgram.coverColor ?? '#374151' }}
              className="w-1.5 h-10 rounded-full shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{singleProgram.name}</h1>
              <p className="text-xs uppercase tracking-wider text-gray-400 mt-0.5">Calendar</p>
            </div>
          </div>
        ) : programIds.length > 1 ? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-xs uppercase tracking-wider text-gray-400 mt-0.5">
              Filtered to {programIds.length} programs
            </p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold">Calendar</h1>
        )}
        <div className="flex items-center gap-2">
          <Button variant="tertiary" onClick={prevMonth} aria-label="Previous month">
            ←
          </Button>
          <span className="text-base font-medium w-44 text-center select-none">{monthLabel}</span>
          <Button variant="tertiary" onClick={nextMonth} aria-label="Next month">
            →
          </Button>
        </div>
      </div>

      {/* Sticky movement-filter sub-header */}
      {allMovements.length > 0 && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-4 bg-gray-950/90 backdrop-blur supports-[backdrop-filter]:bg-gray-950/70 border-b border-gray-800">
          {/* Wide layout: full chip row */}
          <div className="hidden min-[520px]:block">
            <MovementFilterInput
              allMovements={allMovements}
              selectedIds={filterMovementIds}
              onChange={setFilterMovementIds}
            />
          </div>
          {/* Narrow layout: collapsed details/summary */}
          <details className="block min-[520px]:hidden">
            <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden inline-block">
              <Chip variant="neutral">
                Filters{filterMovementIds.length ? ` (${filterMovementIds.length})` : ''}
              </Chip>
            </summary>
            <div className="mt-2">
              <MovementFilterInput
                allMovements={allMovements}
                selectedIds={filterMovementIds}
                onChange={setFilterMovementIds}
              />
            </div>
          </details>
        </div>
      )}

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-px">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs text-gray-400 py-1">
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
        defaultProgramId={defaultProgramIdForCreate}
        onClose={() => { setSelectedDate(null); setSelectedWorkoutId(null) }}
        onSaved={() => { setSelectedDate(null); setSelectedWorkoutId(null); loadWorkouts() }}
        onAutoSaved={loadWorkouts}
        onReordered={loadWorkouts}
        onWorkoutSelect={(id) => setSelectedWorkoutId(id)}
        onNewWorkout={() => setSelectedWorkoutId(null)}
      />
    </div>
  )
}
