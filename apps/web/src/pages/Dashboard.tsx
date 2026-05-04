import { useEffect, useState } from 'react'
import { api, type DashboardToday } from '../lib/api.ts'
import { useGym } from '../context/GymContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import WodHeroCard from '../components/WodHeroCard.tsx'
import EmptyState from '../components/ui/EmptyState.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'

export default function Dashboard() {
  const { gymId } = useGym()
  const { user } = useAuth()
  const [data, setData] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gymId) return
    setLoading(true)
    setError(null)
    api.gyms.dashboard.today(gymId)
      .then(setData)
      .catch((e: Error) => setError(e.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [gymId])

  const greeting = greetingFor(user?.firstName ?? user?.name ?? null)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">{greeting}</h1>
      </div>

      {/* Main layout: wide main column + narrow right rail on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* Main column */}
        <div className="flex flex-col gap-5 min-w-0">
          {loading && <Skeleton variant="feed-row" count={1} />}

          {!loading && error && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-gray-400 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && data?.workout && (
            <WodHeroCard
              workout={data.workout}
              myResult={data.myResult}
              leaderboard={data.leaderboard}
              gymMemberCount={data.gymMemberCount}
            />
          )}

          {!loading && !error && data && !data.workout && (
            <EmptyState
              title="No workout today"
              body="Your program doesn't have a workout scheduled for today."
            />
          )}

          {/* Social feed placeholder — deferred until social features are scoped */}
          <SocialPlaceholder />
        </div>

        {/* Right rail — Activity and Upcoming cards land here in later slices */}
        <div className="hidden lg:flex flex-col gap-5">
          <RailPlaceholder label="Activity" />
          <RailPlaceholder label="Coming up" />
        </div>
      </div>
    </div>
  )
}

function greetingFor(firstName: string | null): string {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return firstName ? `Good ${period}, ${firstName}` : `Good ${period}`
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
