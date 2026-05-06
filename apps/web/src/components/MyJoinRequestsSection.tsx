import { useEffect, useState } from 'react'
import { api, type GymJoinRequest } from '../lib/api'
import Button from './ui/Button'
import Skeleton from './ui/Skeleton'

// Outgoing join requests on /profile (slice D2). Sibling to MyInvitationsSection
// — invitations are incoming (someone invited you), join requests are outgoing
// (you asked to join). Both belong on the user's profile.
//
// Rendered conditionally — when the user has no pending join requests we hide
// the section entirely rather than showing a "no pending requests" empty state,
// so the profile page doesn't get cluttered for the common case.
export default function MyJoinRequestsSection() {
  const [requests, setRequests] = useState<GymJoinRequest[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.users.me.joinRequests.list()
      .then((list) => { if (!cancelled) setRequests(list) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [])

  async function handleCancel(req: GymJoinRequest) {
    setActingOnId(req.id)
    setError(null)
    try {
      await api.gyms.joinRequest.cancel(req.gymId)
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel request')
    } finally {
      setActingOnId(null)
    }
  }

  if (!hasLoaded) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Outgoing requests</h2>
        <Skeleton variant="history-row" count={1} />
      </section>
    )
  }

  if (requests.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Outgoing requests</h2>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li key={r.id} className="rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-slate-950 dark:text-white">
                Pending request to join <span className="font-semibold">{r.gym.name}</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Sent {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button variant="secondary" onClick={() => handleCancel(r)} disabled={actingOnId === r.id}>
              {actingOnId === r.id ? 'Cancelling…' : 'Cancel request'}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </section>
  )
}
