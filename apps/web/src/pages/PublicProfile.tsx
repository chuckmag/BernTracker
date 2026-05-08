import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type PublicUserProfile } from '../lib/api'
import Avatar from '../components/Avatar'
import Skeleton from '../components/ui/Skeleton'

function displayName(profile: PublicUserProfile): string {
  if (profile.firstName || profile.lastName) {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  }
  return profile.name ?? 'Athlete'
}

export default function PublicProfile() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    setError(null)
    api.users.public(userId)
      .then(setProfile)
      .catch((e: Error) => setError(e.message ?? 'User not found'))
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-950 dark:text-gray-400 dark:hover:text-white transition-colors"
      >
        ← Back
      </button>

      {loading && <Skeleton variant="feed-row" count={2} />}

      {!loading && error && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {!loading && profile && (
        <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4">
          <Avatar
            avatarUrl={profile.avatarUrl}
            firstName={profile.firstName}
            lastName={profile.lastName}
            email={profile.name ?? 'athlete'}
            size="lg"
          />
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">
            {displayName(profile)}
          </h1>
        </div>
      )}
    </div>
  )
}
