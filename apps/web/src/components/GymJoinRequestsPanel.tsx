import { useEffect, useState } from 'react'
import { api, type GymJoinRequest } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'

function requesterDisplayName(user: { firstName: string | null; lastName: string | null; name: string | null; email: string } | null): string {
  if (!user) return '—'
  const first = user.firstName?.trim()
  const last = user.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (user.name?.trim()) return user.name.trim()
  return user.email
}

// Staff-facing list of incoming join requests. Mirrors GymInvitationsPanel's
// shape but for the USER_REQUESTED direction — no invite-by-email form here
// (users initiate the request themselves on /gyms/browse).
export default function GymJoinRequestsPanel() {
  const { gymId } = useGym()
  const [requests, setRequests] = useState<GymJoinRequest[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  useEffect(() => {
    if (!gymId) return
    let cancelled = false
    setError(null)
    api.gyms.joinRequests.list(gymId)
      .then((list) => { if (!cancelled) setRequests(list) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load join requests') })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [gymId])

  async function handle(action: 'approve' | 'decline', id: string) {
    if (!gymId) return
    setActingOnId(id)
    setError(null)
    try {
      if (action === 'approve') await api.gyms.joinRequests.approve(gymId, id)
      else await api.gyms.joinRequests.decline(gymId, id)
      // Both outcomes drop the row from the pending list.
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} request`)
    } finally {
      setActingOnId(null)
    }
  }

  if (!gymId) return null

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Join requests</h2>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!hasLoaded ? (
        <Skeleton variant="history-row" count={2} />
      ) : requests.length === 0 ? (
        <EmptyState title="No pending requests" body="Users who request to join from Browse Gyms show up here." />
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-200 dark:bg-gray-900 dark:border-gray-800 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-950 dark:text-white truncate">{requesterDisplayName(r.user)}</p>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  {r.user?.email ?? '—'} · requested {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button onClick={() => handle('approve', r.id)} disabled={actingOnId === r.id}>
                  {actingOnId === r.id ? 'Approving…' : 'Approve'}
                </Button>
                <Button variant="secondary" onClick={() => handle('decline', r.id)} disabled={actingOnId === r.id}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
