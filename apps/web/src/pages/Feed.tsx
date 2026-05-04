import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type PersonalProgram, type Workout } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { useGym } from '../context/GymContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import { makePersonalProgramScope } from '../lib/personalProgramScope.ts'
import Skeleton from '../components/ui/Skeleton.tsx'
import BarbellIcon from '../components/icons/BarbellIcon.tsx'
import UsersIcon from '../components/icons/UsersIcon.tsx'
import PersonalProgramIcon from '../components/icons/PersonalProgramIcon.tsx'
import WorkoutDrawer from '../components/WorkoutDrawer.tsx'

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
  const { gymId } = useGym()
  const { selected: programIds, available, clear: clearProgramFilter } = useProgramFilter()
  const [workouts, setWorkouts] = useState<Workout[]>([])
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

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setWorkouts([])
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
    api.workouts.list(
      gymId,
      from.toISOString(),
      to.toISOString(),
      programIds.length ? { programIds } : undefined,
    )
      .then((data) => {
        if (!cancelled) {
          setWorkouts(data.filter((w) => w.status === 'PUBLISHED'))
          fetchStartRef.current = from
          fetchEndRef.current = to
          setFetchStart(from)
          setFetchEnd(to)
        }
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId, programIdsKey])  // eslint-disable-line react-hooks/exhaustive-deps

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
      const data = await api.workouts.list(
        gymId,
        fetchStartRef.current.toISOString(),
        fetchEndRef.current.toISOString(),
        programIds.length ? { programIds } : undefined,
      )
      setWorkouts(data.filter((w) => w.status === 'PUBLISHED'))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [gymId, programIdsKey])  // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(() => {
    if (!gymId || !fetchStartRef.current || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const newFrom = addDays(fetchStartRef.current, -PAGE_DAYS)
    const newTo = addDays(fetchStartRef.current, -1)
    newTo.setHours(23, 59, 59, 999)
    api.workouts.list(
      gymId,
      newFrom.toISOString(),
      newTo.toISOString(),
      programIds.length ? { programIds } : undefined,
    )
      .then((data) => {
        setWorkouts((prev) => [...prev, ...data.filter((w) => w.status === 'PUBLISHED')])
        fetchStartRef.current = newFrom
        setFetchStart(newFrom)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        loadingMoreRef.current = false
        setLoadingMore(false)
      })
  }, [gymId, programIdsKey])  // eslint-disable-line react-hooks/exhaustive-deps

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

  // Future tiles only extend as far as the last day with a workout scheduled.
  // If nothing is planned ahead, the feed ends at today.
  const latestFutureWorkout = workouts.reduce<Date | null>((latest, w) => {
    const d = new Date(w.scheduledAt)
    return toDateKey(d) > todayKey ? (!latest || d > latest ? d : latest) : latest
  }, null)
  const blockEnd = latestFutureWorkout ?? today

  const dayBlocks = fetchStart ? buildDayBlocks(workouts, fetchStart, blockEnd) : []

  // Single-program filter gets a featured header (color stripe + name).
  // Multi-program gets a compact chip pointing at the picker.
  const singleProgram = programIds.length === 1
    ? available.find(({ program }) => program.id === programIds[0])?.program ?? null
    : null

  // Workouts on the day the drawer is open for — fed to the drawer's
  // "today's workouts" nav so the user can hop between siblings.
  const drawerWorkoutsOnDay = addingForDate
    ? (dayBlocks.find((b) => b.dateKey === addingForDate)?.workouts ?? []).filter(
        (w) => personalProgram && w.programId === personalProgram.id,
      )
    : []

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
                <span className="text-xs font-semibold tracking-widest text-gray-400">
                  {formatDayLabel(dateKey, todayKey)}
                </span>
                <hr className="flex-1 border-gray-800" />
                {personalScope && (
                  <button
                    type="button"
                    onClick={() => setAddingForDate(dateKey)}
                    aria-label={`Add personal workout on ${formatDayLabel(dateKey, todayKey).toLowerCase()}`}
                    title="Add personal workout"
                    className="-my-1 -mr-1 w-7 h-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  >
                    <span aria-hidden="true" className="text-base leading-none">+</span>
                  </button>
                )}
              </div>

              {gymTiles.length === 0 && personalTiles.length === 0 ? (
                <p className="text-sm text-gray-500 pl-1">No workouts planned</p>
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
                          <span className="h-px flex-1 bg-gray-800" />
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-gray-500">
                            <PersonalProgramIcon size={12} />
                            Extra work
                          </span>
                          <span className="h-px flex-1 bg-gray-800" />
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
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors text-left group border-l-4 ${styles.accentBar}`}
    >
      <span className={`shrink-0 mt-0.5 w-7 h-6 flex items-center justify-center rounded text-xs font-bold ${styles.bg} ${styles.tint}`}>
        {styles.abbr}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white break-words">
          {isPersonal && (
            <span
              className="inline-flex items-center mr-1.5 text-indigo-400 align-text-bottom"
              title="Personal Program — your own extra work"
            >
              <PersonalProgramIcon size={14} />
            </span>
          )}
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
