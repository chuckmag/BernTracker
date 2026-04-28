import { useEffect, useState, type FormEvent } from 'react'
import { api, type GymInvitation, type Role } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

// Mirrors the server-side GRANTABLE_BY rule in apps/api/src/routes/membershipRequests.ts.
const GRANTABLE_BY: Record<Role, Role[]> = {
  OWNER: ['MEMBER', 'COACH', 'PROGRAMMER', 'OWNER'],
  PROGRAMMER: ['MEMBER', 'COACH', 'PROGRAMMER'],
  COACH: ['MEMBER'],
  MEMBER: [],
}

const STATUS_TINT: Record<GymInvitation['status'], string> = {
  PENDING: 'bg-amber-500/20 text-amber-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  DECLINED: 'bg-gray-700/40 text-gray-300',
  REVOKED: 'bg-rose-500/20 text-rose-300',
  EXPIRED: 'bg-gray-700/40 text-gray-400',
}

export default function GymInvitationsPanel() {
  const { gymId, gymRole } = useGym()
  const [invitations, setInvitations] = useState<GymInvitation[]>([])
  // hasLoaded — avoid flashing the EmptyState before the fetch returns.
  const [hasLoaded, setHasLoaded] = useState(false)
  const [email, setEmail] = useState('')
  const [roleToGrant, setRoleToGrant] = useState<Role>('MEMBER')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  const grantable = gymRole ? GRANTABLE_BY[gymRole] : []
  const canInvite = grantable.length > 0

  useEffect(() => {
    if (!gymId) return
    api.gyms.invitations.list(gymId)
      .then(setInvitations)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invitations'))
      .finally(() => setHasLoaded(true))
  }, [gymId])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!gymId) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.gyms.invitations.create(gymId, { email: email.trim(), roleToGrant })
      setInvitations((prev) => [created, ...prev])
      setEmail('')
      setRoleToGrant('MEMBER')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!gymId) return
    setActingOnId(id)
    setError(null)
    try {
      const updated = await api.gyms.invitations.revoke(gymId, id)
      setInvitations((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke invitation')
    } finally {
      setActingOnId(null)
    }
  }

  if (!gymId) return null

  const pending = invitations.filter((i) => i.status === 'PENDING')
  const closed = invitations.filter((i) => i.status !== 'PENDING')

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Invitations</h2>

      {canInvite && (
        <form onSubmit={handleSend} className="rounded-xl bg-gray-800 p-4 space-y-3 max-w-xl">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_max-content_max-content] gap-3 items-end">
            <label className="block">
              <span className="text-xs text-gray-400 mb-1 block">Invite by email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-400 mb-1 block" htmlFor="invite-role">Role</span>
              <select
                id="invite-role"
                value={roleToGrant}
                onChange={(e) => setRoleToGrant(e.target.value as Role)}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {grantable.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={submitting || !email.trim()}>
              {submitting ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </form>
      )}

      {!hasLoaded ? (
        <Skeleton variant="history-row" count={2} />
      ) : invitations.length === 0 ? (
        <EmptyState title="No invitations yet" body="Invited members will appear here while they wait to accept." />
      ) : (
        <div className="space-y-2">
          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-900 border border-gray-800 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400">
                      {ROLE_LABEL[inv.roleToGrant]} · invited {new Date(inv.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={['text-xs px-2 py-0.5 rounded-full', STATUS_TINT[inv.status]].join(' ')}>{inv.status.toLowerCase()}</span>
                    <Button
                      variant="secondary"
                      onClick={() => handleRevoke(inv.id)}
                      disabled={actingOnId === inv.id}
                    >
                      {actingOnId === inv.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 px-1 py-2">
                {closed.length} resolved invitation{closed.length === 1 ? '' : 's'}
              </summary>
              <ul className="space-y-2 mt-2">
                {closed.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-900 border border-gray-800 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-300 truncate">{inv.email}</p>
                      <p className="text-xs text-gray-500">{ROLE_LABEL[inv.roleToGrant]} · invited {new Date(inv.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={['text-xs px-2 py-0.5 rounded-full shrink-0', STATUS_TINT[inv.status]].join(' ')}>{inv.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
