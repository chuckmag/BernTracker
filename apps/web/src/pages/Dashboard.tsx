import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DashboardToday } from '../lib/api.ts'
import { useGym } from '../context/GymContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import WodHeroCard from '../components/WodHeroCard.tsx'
import LeaderboardCard from '../components/LeaderboardCard.tsx'
import UpcomingCard from '../components/UpcomingCard.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import Button from '../components/ui/Button.tsx'

function dashboardStorageKey(gymId: string): string {
  return `dashboardProgram:${gymId}`
}

function readDashboardProgram(gymId: string): string {
  try { return localStorage.getItem(dashboardStorageKey(gymId)) ?? '' } catch { return '' }
}

function writeDashboardProgram(gymId: string, id: string): void {
  try { localStorage.setItem(dashboardStorageKey(gymId), id) } catch { /* ignore quota */ }
}

export default function Dashboard() {
  const { gymId, loading: gymLoading, clearGymId } = useGym()
  const { user } = useAuth()
  const { available, defaultProgramId } = useProgramFilter()
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const [data, setData] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(false)
  const [noGym, setNoGym] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track which gym the selection was last initialized for so we re-seed
  // when the active gym changes without running on every available[] update.
  const initializedForGymRef = useRef<string | null>(null)

  // Seed selectedProgramId from storage (falling back to the gym's default
  // program) the first time `available` resolves for the active gym.
  useEffect(() => {
    if (!gymId || available.length === 0) return
    if (initializedForGymRef.current === gymId) return

    initializedForGymRef.current = gymId
    const stored = readDashboardProgram(gymId)
    const validIds = new Set(available.map((gp) => gp.program.id))

    if (stored && validIds.has(stored)) {
      setSelectedProgramId(stored)
    } else if (defaultProgramId) {
      setSelectedProgramId(defaultProgramId)
      writeDashboardProgram(gymId, defaultProgramId)
    } else {
      setSelectedProgramId('')
    }
  }, [gymId, available, defaultProgramId])

  // Reset when the gym changes so the above effect re-seeds for the new gym.
  useEffect(() => {
    if (!gymId) return
    if (initializedForGymRef.current !== gymId) {
      setSelectedProgramId('')
    }
  }, [gymId])

  useEffect(() => {
    if (gymLoading) return
    if (!gymId) {
      setNoGym(true)
      return
    }
    setNoGym(false)
    setLoading(true)
    setError(null)
    const programIds = selectedProgramId ? [selectedProgramId] : undefined
    api.gyms.dashboard.today(gymId, programIds)
      .then(setData)
      .catch((e: Error & { status?: number }) => {
        if (e.status === 403) {
          clearGymId()
          setNoGym(true)
        } else {
          setError(e.message ?? 'Failed to load dashboard')
        }
      })
      .finally(() => setLoading(false))
  }, [gymId, gymLoading, selectedProgramId])  // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectProgram(id: string) {
    setSelectedProgramId(id)
    if (gymId) writeDashboardProgram(gymId, id)
  }

  const firstName = firstNameOf(user?.firstName, user?.name)
  const greeting = greetingFor(firstName)
  const showPicker = !gymLoading && !noGym && available.length > 1
  const upcomingProgramIds = selectedProgramId ? [selectedProgramId] : undefined

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <h1 className="basis-[60%] min-w-0 text-2xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight">{greeting}</h1>
        {showPicker && (
          <div className="basis-[40%] min-w-0">
            <select
              value={selectedProgramId}
              onChange={(e) => handleSelectProgram(e.target.value)}
              className="w-full text-sm bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 text-slate-700 dark:text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950"
              aria-label="Filter by program"
            >
              <option value="">All programs</option>
              {available.map(({ program, isDefault, gymId: gpGymId }) => (
                <option key={program.id} value={program.id}>
                  {program.name}{isDefault && gpGymId ? ' (Default)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main layout: wide main column + narrow right rail on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* Main column */}
        <div className="flex flex-col gap-5 min-w-0">
          {(gymLoading || loading) && <Skeleton variant="feed-row" count={1} />}

          {!gymLoading && !loading && noGym && <NoGymCard />}

          {!gymLoading && !loading && error && (
            <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-6 text-slate-500 dark:text-gray-400 text-sm">
              {error}
            </div>
          )}

          {!gymLoading && !loading && !noGym && !error && data?.workout && (
            <>
              <WodHeroCard
                workout={data.workout}
                myResult={data.myResult}
                leaderboard={data.leaderboard}
                gymMemberCount={data.gymMemberCount}
                programSubscriberCount={data.programSubscriberCount}
                isHeroWorkoutGymAffiliated={data.isHeroWorkoutGymAffiliated}
              />
              <LeaderboardCard
                workoutId={data.workout.id}
                workoutTitle={data.workout.title}
                myUserId={user?.id ?? ''}
              />
            </>
          )}

          {!gymLoading && !loading && !noGym && !error && data && !data.workout && (
            <EmptyState
              title="No workout today"
              body={
                selectedProgramId
                  ? 'This program has no workout scheduled for today.'
                  : "Your program doesn't have a workout scheduled for today."
              }
            />
          )}

          {/* Upcoming card — inline on mobile, hidden on desktop (right rail has it) */}
          {!noGym && gymId && (
            <div className="lg:hidden">
              <UpcomingCard gymId={gymId} programIds={upcomingProgramIds} />
            </div>
          )}

          {/* Social feed placeholder — deferred until social features are scoped */}
          {!noGym && <SocialPlaceholder />}
        </div>

        {/* Right rail — desktop only */}
        <div className="hidden lg:flex flex-col gap-5">
          <RailPlaceholder label="Activity" />
          {!noGym && gymId && <UpcomingCard gymId={gymId} programIds={upcomingProgramIds} />}
        </div>
      </div>
    </div>
  )
}

function firstNameOf(firstName?: string | null, fullName?: string | null): string | null {
  if (firstName) return firstName
  if (fullName) return fullName.split(' ')[0]
  return null
}

function greetingFor(firstName: string | null): string {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return firstName ? `Good ${period}, ${firstName}` : `Good ${period}`
}

function NoGymCard() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
      <div className="text-4xl" aria-hidden="true">🏋️</div>
      <div>
        <h2 className="text-base font-semibold text-slate-950 dark:text-white mb-1">You're not part of a gym yet</h2>
        <p className="text-sm text-slate-500 dark:text-gray-400 max-w-sm">
          Browse public programs to follow, or start tracking your own workouts in your personal program.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button variant="primary">
          <Link to="/programs" className="contents">Browse programs</Link>
        </Button>
        <Button variant="secondary">
          <Link to="/personal-program" className="contents">Start your own</Link>
        </Button>
      </div>
    </div>
  )
}

function SocialPlaceholder() {
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center min-h-[120px]">
      <p className="text-sm font-medium text-slate-400 dark:text-gray-500">Social feed coming soon</p>
      <p className="text-xs text-slate-300 dark:text-gray-600">See how your gym mates are doing</p>
    </div>
  )
}

function RailPlaceholder({ label }: { label: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 border-dashed rounded-xl p-4 min-h-[80px] flex items-center justify-center">
      <span className="text-xs text-slate-300 dark:text-gray-600">{label}</span>
    </div>
  )
}
