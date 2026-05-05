import { useEffect, useState, useRef, type FormEvent } from 'react'
import {
  api,
  type GymInvitation,
  type Invitation,
  type InvitationChannel,
  type Role,
} from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import SegmentedControl from './ui/SegmentedControl'

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

const ALL_CHANNEL_OPTIONS: { value: InvitationChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
]

function buildShareMessage(inv: Invitation, gymName: string | null, joinUrl: string): string {
  const base = gymName
    ? `You've been invited to join ${gymName} on WODalytics!`
    : "You've been invited to join WODalytics!"
  return `${base}\n\nJoin here: ${joinUrl}`
}

// sms: deep-links only work on mobile — detect once at render time
const isMobileDevice =
  typeof navigator !== 'undefined' &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

function InviteShareCard({
  inv,
  gymName,
  onDismiss,
}: {
  inv: Invitation
  gymName: string | null
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  const joinUrl = `${window.location.origin}/join/${inv.code}`
  const message = buildShareMessage(inv, gymName, joinUrl)

  function handleCopy() {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const mailtoHref = inv.email
    ? `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent('You\'re invited to WODalytics')}&body=${encodeURIComponent(message)}`
    : null
  // sms: only usable on mobile — on desktop we show the message inline for copying
  const smsHref = inv.phone && isMobileDevice
    ? `sms:${encodeURIComponent(inv.phone)}?body=${encodeURIComponent(message)}`
    : null

  return (
    <div className="rounded-xl bg-indigo-600/10 border border-indigo-600/30 p-4 space-y-3">
      <div className="space-y-1">
        <p className="text-xs text-indigo-300 uppercase tracking-wide font-semibold">Invite code ready</p>
        <p className="text-2xl font-mono font-bold tracking-widest text-white">{inv.code}</p>
        <p className="text-xs text-gray-400">
          {inv.email ?? inv.phone} · expires {new Date(inv.expiresAt).toLocaleDateString()}
        </p>
      </div>

      {/* SMS on desktop: show the message text so the sender can copy + forward */}
      {inv.phone && !isMobileDevice && (
        <div className="rounded-lg bg-gray-900 border border-gray-700 p-3 space-y-1">
          <p className="text-xs text-gray-400">Copy and send via SMS</p>
          <p className="text-xs text-gray-200 whitespace-pre-wrap font-mono">{message}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {mailtoHref && (
          <a
            href={mailtoHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-sm text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Open in email app
          </a>
        )}
        {smsHref && (
          <a
            href={smsHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-sm text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Open in Messages
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-sm text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        >
          {copied ? 'Copied!' : 'Copy message'}
        </button>
        <Button variant="tertiary" onClick={onDismiss}>Done</Button>
      </div>
    </div>
  )
}

export default function GymInvitationsPanel() {
  const { gymId, gymRole, gyms } = useGym()
  const gymName = gymId ? (gyms.find((g) => g.id === gymId)?.name ?? null) : null

  const [invitations, setInvitations] = useState<GymInvitation[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)

  // Form state
  const [channel, setChannel] = useState<InvitationChannel>('EMAIL')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roleToGrant, setRoleToGrant] = useState<Role>('MEMBER')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Newly-created code invitation — shown until the user dismisses
  const [pendingCodeInvite, setPendingCodeInvite] = useState<Invitation | null>(null)

  // List action state
  const [listError, setListError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const grantable = gymRole ? GRANTABLE_BY[gymRole] : []
  const canInvite = grantable.length > 0
  // SMS channel only works via sms: deep-link — only offer it on mobile
  const channelOptions = isMobileDevice ? ALL_CHANNEL_OPTIONS : ALL_CHANNEL_OPTIONS.filter((o) => o.value !== 'SMS')

  useEffect(() => {
    if (!gymId) return
    api.gyms.invitations.list(gymId)
      .then(setInvitations)
      .catch((e) => setListError(e instanceof Error ? e.message : 'Failed to load invitations'))
      .finally(() => setHasLoaded(true))
  }, [gymId])

  // Reset the contact field when channel changes
  useEffect(() => {
    setEmail('')
    setPhone('')
    setFormError(null)
    inputRef.current?.focus()
  }, [channel])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!gymId) return
    setSubmitting(true)
    setFormError(null)
    setPendingCodeInvite(null)
    try {
      const payload =
        channel === 'EMAIL'
          ? { channel: 'EMAIL' as const, email: email.trim(), roleToGrant }
          : { channel: 'SMS' as const, phone: phone.trim(), roleToGrant }

      const result = await api.gyms.invitations.invite(gymId, payload)

      if (result.kind === 'membershipRequest') {
        // Existing user — add to the list immediately
        setInvitations((prev) => [result.data, ...prev])
        setEmail('')
        setPhone('')
        setRoleToGrant('MEMBER')
      } else {
        // Pre-signup — show share card so the sender can forward the code
        setPendingCodeInvite(result.data)
        setEmail('')
        setPhone('')
        setRoleToGrant('MEMBER')
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRevokeMembership(id: string) {
    if (!gymId) return
    setActingOnId(id)
    setListError(null)
    try {
      const updated = await api.gyms.invitations.revoke(gymId, id)
      setInvitations((prev) => prev.map((i) => (i.id === id ? updated : i)))
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to revoke invitation')
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
        <div className="space-y-3 max-w-xl">
          <form onSubmit={handleSend} className="rounded-xl bg-gray-800 p-4 space-y-3">
            {channelOptions.length > 1 && (
              <SegmentedControl
                options={channelOptions}
                value={channel}
                onChange={(v) => setChannel(v)}
                aria-label="Invite channel"
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_max-content_max-content] gap-3 items-end">
              {channel === 'EMAIL' ? (
                <label className="block">
                  <span className="text-xs text-gray-400 mb-1 block">Email address</span>
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="text-xs text-gray-400 mb-1 block">Phone number</span>
                  <input
                    ref={inputRef}
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+15551234567"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-gray-400 mb-1 block">Role</span>
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
              <Button
                type="submit"
                disabled={submitting || (channel === 'EMAIL' ? !email.trim() : !phone.trim())}
              >
                {submitting ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
            {formError && <p className="text-sm text-rose-400">{formError}</p>}
          </form>

          {pendingCodeInvite && (
            <InviteShareCard
              inv={pendingCodeInvite}
              gymName={gymName}
              onDismiss={() => setPendingCodeInvite(null)}
            />
          )}
        </div>
      )}

      {!hasLoaded ? (
        <Skeleton variant="history-row" count={2} />
      ) : invitations.length === 0 ? (
        <EmptyState title="No invitations yet" body="Invited members will appear here while they wait to accept." />
      ) : (
        <div className="space-y-2">
          {listError && <p className="text-sm text-rose-400">{listError}</p>}
          {pending.length > 0 && (
            <ul className="space-y-2">
              {pending.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-900 border border-gray-800 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{inv.email ?? inv.userId ?? '—'}</p>
                    <p className="text-xs text-gray-400">
                      {ROLE_LABEL[inv.roleToGrant]} · invited {new Date(inv.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={['text-xs px-2 py-0.5 rounded-full', STATUS_TINT[inv.status]].join(' ')}>
                      {inv.status.toLowerCase()}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleRevokeMembership(inv.id)}
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
                      <p className="text-sm text-gray-300 truncate">{inv.email ?? inv.userId ?? '—'}</p>
                      <p className="text-xs text-gray-500">
                        {ROLE_LABEL[inv.roleToGrant]} · invited {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={['text-xs px-2 py-0.5 rounded-full shrink-0', STATUS_TINT[inv.status]].join(' ')}>
                      {inv.status.toLowerCase()}
                    </span>
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
