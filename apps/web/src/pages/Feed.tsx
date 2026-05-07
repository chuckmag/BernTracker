import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api, type PersonalProgram, type Workout } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { useGym } from '../context/GymContext.tsx'
import { useProgramFilter, PERSONAL_PROGRAM_SENTINEL } from '../context/ProgramFilterContext.tsx'
import { makePersonalProgramScope } from '../lib/personalProgramScope.ts'
import Skeleton from '../components/ui/Skeleton.tsx'
import Button from '../components/ui/Button.tsx'
import BarbellIcon from '../components/icons/BarbellIcon.tsx'
import UsersIcon from '../components/icons/UsersIcon.tsx'
import PersonalProgramIcon from '../components/icons/PersonalProgramIcon.tsx'
import WorkoutDrawer from '../components/WorkoutDrawer.tsx'
import ProgramFilterPicker from '../components/ProgramFilterPicker.tsx'

const INITIAL_FUTURE_DAYS = 30
const INITIAL_PAST_DAYS = 30
const PAGE_DAYS = 30

type DayBlock = { dateKey: string; workouts: Workout[] }

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Builds a contiguous DayBlock[] from `start` to `end`, newest-first.
// Days without workouts get an empty array so they render as "No workouts planned".
function buildDayBlocks(workouts: Workout[], start: Date, end: Date): DayBlock[] {
  const byDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    // scheduledAt is UTC midnight — slice the ISO string to get the UTC calendar date,
    // avoiding a local-timezone shift that would bucket the workout a day early for US users.
    const key = w.scheduledAt.slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(w)
  }
  const blocks: DayBlock[] = []
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let cursor = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor >= startMidnight) {
    const key = toDateKey(cursor)
    blocks.push({ dateKey: key, workouts: byDate[key] ?? [] })
    cursor = addDays(cursor, -1)
  }
  return blocks
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
  const { gymId, loading: gymLoading, clearGymId } = useGym()
  const { gymProgramIds, selected } = useProgramFilter()
  // Strip the sentinel so only real DB ids go to the gym workouts API.
  const programIds = gymProgramIds
  // Whether each source should appear in the feed based on the current filter.
  const includePersonal = selected.length === 0 || selected.includes(PERSONAL_PROGRAM_SENTINEL)
  const includeGym = selected.length === 0 || gymProgramIds.length > 0
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [personalWorkouts, setPersonalWorkouts] = useState<Workout[]>([])
  const [fetchStart, setFetchStart] = useState<Date | null>(null)
  const [fetchEnd, setFetchEnd] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Personal program is upserted on first feed load so the day-header "+"
  // button can open WorkoutDrawer with the personal scope without an extra
  // round-trip on click. Failure is non-fatal — the button just stays hidden.
  const [personalProgram, setPersonalProgram] = useState<PersonalProgram | null>(null)
  // dateKey the drawer is open for (null = closed). Adding from the feed
  // always targets the personal program; the date is inherited from the row.
  const [addingForDate, setAddingForDate] = useState<string | null>(null)
  // Refs let loadMore read current values without needing them in its dep array,
  // so the IntersectionObserver doesn't reconnect on every page load.
  const fetchStartRef = useRef<Date | null>(null)
  const fetchEndRef = useRef<Date | null>(null)
  const loadingMoreRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const programIdsKey = programIds.join(',')
  const includeGymKey = String(includeGym)
  const includePersonalKey = String(includePersonal)

  useEffect(() => {
    if (gymLoading || !gymId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setWorkouts([])
    setPersonalWorkouts([])
    setFetchStart(null)
    setFetchEnd(null)
    fetchStartRef.current = null
    fetchEndRef.current = null
    loadingMoreRef.current = false
    const today = new Date()
    const from = addDays(today, -INITIAL_PAST_DAYS)
    const to = new Date(today)
    to.setDate(today.getDate() + INITIAL_FUTURE_DAYS)
    to.setHours(23, 59, 59, 999)

    const gymFetch: Promise<Workout[]> = includeGym
      ? api.workouts.list(gymId, from.toISOString(), to.toISOString(), programIds.length ? { programIds } : undefined)
          .then((data) => data.filter((w) => w.status === 'PUBLISHED'))
      : Promise.resolve([])

    const personalFetch: Promise<Workout[]> = includePersonal
      ? api.me.personalProgram.workouts.list({ from: from.toISOString(), to: to.toISOString() })
      : Promise.resolve([])

    Promise.all([gymFetch, personalFetch])
      .then(([gymData, personalData]) => {
        if (!cancelled) {
          setWorkouts(gymData)
          setPersonalWorkouts(personalData)
          fetchStartRef.current = from
          fetchEndRef.current = to
          setFetchStart(from)
          setFetchEnd(to)
        }
      })
      .catch((e: Error & { status?: number }) => {
        if (!cancelled) {
          if (e.status === 403) {
            // A 403 with active program filters means an inaccessible programId
            // was passed — surface an error, don't wipe the user's gym.
            // A 403 with no filters means the gymId itself is stale — evict it.
            if (programIds.length) setError(e.message)
            else clearGymId()
            return
          }
          setError(e.message)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId, gymLoading, programIdsKey, includeGymKey, includePersonalKey])  // eslint-disable-line react-hooks/exhaustive-deps

  // Upsert the personal program once per session. Independent of the gym /
  // program-filter loop above so the "+" button is available even before the
  // workouts list resolves.
  useEffect(() => {
    let cancelled = false
    api.me.personalProgram.get()
      .then((p) => { if (!cancelled) setPersonalProgram(p) })
      .catch(() => { /* non-fatal — add button stays hidden */ })
    return () => { cancelled = true }
  }, [])

  const personalScope = useMemo(
    () => personalProgram ? makePersonalProgramScope({ program: personalProgram }) : null,
    [personalProgram],
  )

  // Re-query the visible window after a personal-program save so the new tile
  // appears in its day group without a full page reload.
  const reloadVisibleWindow = useCallback(async () => {
    if (!gymId || !fetchStartRef.current || !fetchEndRef.current) return
    try {
      const gymFetch: Promise<Workout[]> = includeGym
        ? api.workouts.list(gymId, fetchStartRef.current.toISOString(), fetchEndRef.current.toISOString(), programIds.length ? { programIds } : undefined)
            .then((data) => data.filter((w) => w.status === 'PUBLISHED'))
        : Promise.resolve([])
      const personalFetch: Promise<Workout[]> = includePersonal
        ? api.me.personalProgram.workouts.list({ from: fetchStartRef.current.toISOString(), to: fetchEndRef.current.toISOString() })
        : Promise.resolve([])
      const [gymData, personalData] = await Promise.all([gymFetch, personalFetch])
      setWorkouts(gymData)
      setPersonalWorkouts(personalData)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [gymId, programIdsKey, includeGym, includePersonal])  // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!gymId || !fetchStartRef.current || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const newFrom = addDays(fetchStartRef.current, -PAGE_DAYS)
    const newTo = addDays(fetchStartRef.current, -1)
    newTo.setHours(23, 59, 59, 999)

    const gymFetch: Promise<Workout[]> = includeGym
      ? api.workouts.list(gymId, newFrom.toISOString(), newTo.toISOString(), programIds.length ? { programIds } : undefined)
          .then((data) => data.filter((w) => w.status === 'PUBLISHED'))
      : Promise.resolve([])
    const personalFetch: Promise<Workout[]> = includePersonal
      ? api.me.personalProgram.workouts.list({ from: newFrom.toISOString(), to: newTo.toISOString() })
      : Promise.resolve([])

    Promise.all([gymFetch, personalFetch])
      .then(([gymData, personalData]) => {
        setWorkouts((prev) => [...prev, ...gymData])
        setPersonalWorkouts((prev) => [...prev, ...personalData])
        fetchStartRef.current = newFrom
        setFetchStart(newFrom)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        loadingMoreRef.current = false
        setLoadingMore(false)
      })
  }, [gymId, programIdsKey, includeGym, includePersonal])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  if (!gymLoading && !gymId) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
          <div className="text-4xl" aria-hidden="true">🏋️</div>
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white mb-1">No workouts yet</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400 max-w-sm">
              Browse public programs to follow, or add workouts to your personal program.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button variant="primary">
              <Link to="/programs" className="contents">Browse programs</Link>
            </Button>
            <Button variant="secondary">
              <Link to="/personal-program" className="contents">Track personal workout</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const today = new Date()
  const todayKey = toDateKey(today)

  const allWorkouts = [...workouts, ...personalWorkouts]

  // Future tiles only extend as far as the last day with a workout scheduled.
  // If nothing is planned ahead, the feed ends at today.
  const latestFutureWorkout = allWorkouts.reduce<Date | null>((latest, w) => {
    const d = new Date(w.scheduledAt)
    return toDateKey(d) > todayKey ? (!latest || d > latest ? d : latest) : latest
  }, null)
  const blockEnd = latestFutureWorkout ?? today

  const dayBlocks = fetchStart ? buildDayBlocks(allWorkouts, fetchStart, blockEnd) : []

  // Workouts on the day the drawer is open for — fed to the drawer's
  // "today's workouts" nav so the user can hop between siblings.
  const drawerWorkoutsOnDay = addingForDate
    ? (dayBlocks.find((b) => b.dateKey === addingForDate)?.workouts ?? []).filter(
        (w) => personalProgram && w.programId === personalProgram.id,
      )
    : []

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Feed</h1>
        <ProgramFilterPicker variant="inline" />
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {loading && <Skeleton variant="feed-row" count={4} />}

      <div className="space-y-8">
        {dayBlocks.map(({ dateKey, workouts: dayWorkouts }) => {
          // Personal-program tiles always sort to the bottom of the day with
          // a divider above them — readable as "your extra work, on top of
          // the class programming". Detection is by program id (the personal
          // program is upserted at mount and pinned to the user). Note:
          // unaffiliated catalog workouts (e.g. CrossFit Mainsite) carry
          // `programId !== null` but `!== personalProgramId`, so they stay
          // grouped with the gym tiles — only the user's *own* program
          // moves to the bottom.
          const personalProgramId = personalProgram?.id ?? null
          const gymTiles: Workout[] = []
          const personalTiles: Workout[] = []
          for (const w of dayWorkouts) {
            if (personalProgramId !== null && w.programId === personalProgramId) {
              personalTiles.push(w)
            } else {
              gymTiles.push(w)
            }
          }
          return (
            <div key={dateKey}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-gray-400">
                  {formatDayLabel(dateKey, todayKey)}
                </span>
                <hr className="flex-1 border-slate-200 dark:border-gray-800" />
                {personalScope && (
                  <button
                    type="button"
                    onClick={() => setAddingForDate(dateKey)}
                    aria-label={`Add personal workout on ${formatDayLabel(dateKey, todayKey).toLowerCase()}`}
                    title="Add personal workout"
                    className="-my-1 -mr-1 w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
                  >
                    <span aria-hidden="true" className="text-base leading-none">+</span>
                  </button>
                )}
              </div>

              {gymTiles.length === 0 && personalTiles.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-gray-500 pl-1">No workouts planned</p>
              ) : (
                <div className="space-y-2">
                  {gymTiles.map((workout) => (
                    <FeedTile key={workout.id} workout={workout} onClick={() => navigate(`/workouts/${workout.id}`)} />
                  ))}

                  {personalTiles.length > 0 && (
                    <>
                      {gymTiles.length > 0 && (
                        <div
                          className="flex items-center gap-2 pt-2 pb-0.5"
                          aria-hidden="true"
                        >
                          <span className="h-px flex-1 bg-slate-200 dark:bg-gray-800" />
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-400 dark:text-gray-500">
                            <PersonalProgramIcon size={12} />
                            Extra work
                          </span>
                          <span className="h-px flex-1 bg-slate-200 dark:bg-gray-800" />
                        </div>
                      )}
                      {personalTiles.map((workout) => (
                        <FeedTile
                          key={workout.id}
                          workout={workout}
                          isPersonal
                          onClick={() => navigate(`/workouts/${workout.id}`)}
                        />
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div ref={sentinelRef} className="h-1" />
      {loadingMore && <Skeleton variant="feed-row" count={2} />}

      {personalScope && (
        <WorkoutDrawer
          dateKey={addingForDate}
          workout={undefined}
          workoutsOnDay={drawerWorkoutsOnDay}
          scope={personalScope}
          // Personal-program drawer behaves like admin: one Save button, no
          // DRAFT/PUBLISHED state, no inter-row reorder. Forced OWNER here is
          // a no-op since canReorder also requires `kind === 'gym'` upstream.
          userGymRole="OWNER"
          defaultProgramId={personalProgram?.id}
          onClose={() => setAddingForDate(null)}
          onSaved={() => { setAddingForDate(null); reloadVisibleWindow() }}
          onAutoSaved={reloadVisibleWindow}
          onWorkoutSelect={() => { /* feed-add flow is single-row; no inter-day jump */ }}
          onNewWorkout={() => { /* feed-add flow is single-row; no inter-day jump */ }}
        />
      )}
    </div>
  )
}

interface FeedTileProps {
  workout: Workout
  isPersonal?: boolean
  onClick: () => void
}

function FeedTile({ workout, isPersonal = false, onClick }: FeedTileProps) {
  const styles = WORKOUT_TYPE_STYLES[workout.type]
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg bg-white dark:bg-gray-900 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-left group border-l-4 ${styles.accentBar}`}
    >
      <span className={`shrink-0 mt-0.5 w-7 h-6 flex items-center justify-center rounded text-xs font-bold ${styles.bg} ${styles.tint}`}>
        {styles.abbr}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-950 dark:text-white break-words">
          {isPersonal && (
            <span
              className="inline-flex items-center mr-1.5 text-primary align-text-bottom"
              title="Personal Program — your own extra work"
            >
              <PersonalProgramIcon size={14} />
            </span>
          )}
          {workout.title}
        </span>
        {workout.namedWorkout && (
          <span className="text-xs text-primary">● {workout.namedWorkout.name}</span>
        )}
        <FeedTileBadgeRow
          logged={Boolean(workout.myResultId)}
          resultCount={workout._count.results}
        />
      </span>
      <span className="shrink-0 mt-0.5 text-slate-500 dark:text-gray-400 group-hover:text-slate-950 dark:group-hover:text-white transition-colors">›</span>
    </button>
  )
}

// Meta-row beneath each feed tile's title. Renders the loaded/empty barbell
// (which encodes "you have logged a result here") and a `<users-icon> N`
// total-result count when at least one result exists.
function FeedTileBadgeRow({ logged, resultCount }: { logged: boolean; resultCount: number }) {
  if (!logged && resultCount === 0) return null
  return (
    <span className="mt-1.5 flex items-center gap-3 text-xs">
      <span className={logged ? 'text-primary' : 'text-slate-400 dark:text-gray-500'}>
        <BarbellIcon
          loaded={logged}
          size={24}
          title={logged ? "You've logged a result" : 'No result logged yet'}
        />
      </span>
      {resultCount > 0 && (
        <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-gray-400" title={`${resultCount} result${resultCount === 1 ? '' : 's'} on the leaderboard`}>
          <UsersIcon size={16} />
          <span>{resultCount}</span>
        </span>
      )}
    </span>
  )
}
