import { useEffect, useState } from 'react'
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

export default function Dashboard() {
  const { gymId, loading: gymLoading, clearGymId } = useGym()
  const { user } = useAuth()
  const { available } = useProgramFilter()
  const [selectedProgramId, setSelectedProgramId] = useState<string>('')
  const [data, setData] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(false)
  const [noGym, setNoGym] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const firstName = firstNameOf(user?.firstName, user?.name)
  const greeting = greetingFor(firstName)
  const showPicker = !gymLoading && !noGym && available.length > 1

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight text-white">{greeting}</h1>
        {showPicker && (
          <select
            value={selectedProgramId}
            onChange={(e) => setSelectedProgramId(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950"
            aria-label="Filter by program"
          >
            <option value="">All programs</option>
            {available.map(({ program }) => (
              <option key={program.id} value={program.id}>{program.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Main layout: wide main column + narrow right rail on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* Main column */}
        <div className="flex flex-col gap-5 min-w-0">
          {(gymLoading || loading) && <Skeleton variant="feed-row" count={1} />}

          {!gymLoading && !loading && noGym && <NoGymCard />}

          {!gymLoading && !loading && error && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-gray-400 text-sm">
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

          {/* Social feed placeholder — deferred until social features are scoped */}
          {!noGym && <SocialPlaceholder />}
        </div>

        {/* Right rail */}
        <div className="hidden lg:flex flex-col gap-5">
          <RailPlaceholder label="Activity" />
          {!noGym && gymId && <UpcomingCard gymId={gymId} />}
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
      <div className="text-4xl" aria-hidden="true">🏋️</div>
      <div>
        <h2 className="text-base font-semibold text-white mb-1">You're not part of a gym yet</h2>
        <p className="text-sm text-gray-400 max-w-sm">
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
    <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-center min-h-[120px]">
      <p className="text-sm font-medium text-gray-500">Social feed coming soon</p>
      <p className="text-xs text-gray-600">See how your gym mates are doing</p>
    </div>
  )
}

function RailPlaceholder({ label }: { label: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-4 min-h-[80px] flex items-center justify-center">
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  )
}
