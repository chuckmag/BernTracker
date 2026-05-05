import { useState } from 'react'
import { useInvitations } from '../context/InvitationsContext.tsx'
import type { PendingInvitation } from '../lib/api'
import Button from './ui/Button'

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

function formatInviter(
  invitedBy: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string } | null,
): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (invitedBy.name?.trim()) return invitedBy.name.trim()
  return invitedBy.email ?? 'a staff member'
}

function pendingItemKey(item: PendingInvitation): string {
  return item.kind === 'membershipRequest' ? item.data.id : `code-${item.data.code}`
}

function InvitationCard({
  gymName,
  roleToGrant,
  inviterLabel,
  createdAt,
  isActing,
  onAccept,
  onDecline,
}: {
  gymName: string | null
  roleToGrant: string
  inviterLabel: string
  createdAt: string
  isActing: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <li className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
      <div className="space-y-1">
        {gymName ? (
          <p className="text-sm text-white">
            <span className="font-semibold">{gymName}</span>
            <span className="text-gray-400"> invited you as </span>
            <span className="text-indigo-300">{ROLE_LABEL[roleToGrant] ?? roleToGrant}</span>
          </p>
        ) : (
          <p className="text-sm text-white font-semibold">WODalytics invitation</p>
        )}
        <p className="text-xs text-gray-400">
          From {inviterLabel} · {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onAccept} disabled={isActing}>
          {isActing ? 'Accepting…' : 'Accept'}
        </Button>
        <Button variant="secondary" onClick={onDecline} disabled={isActing}>
          Decline
        </Button>
      </div>
    </li>
  )
}

export default function MyInvitationsSection() {
  const { invitations, accept, decline } = useInvitations()
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(action: 'accept' | 'decline', item: PendingInvitation) {
    const key = pendingItemKey(item)
    setActingOn(key)
    setError(null)
    try {
      if (action === 'accept') await accept(item)
      else await decline(item)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} invitation`)
    } finally {
      setActingOn(null)
    }
  }

  // Hide when there are no pending invitations — gym membership is the common
  // case, invites are intermittent.
  if (invitations.length === 0) return null

  return (
    <section id="invitations" className="space-y-3 scroll-mt-16">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Invitations</h2>
      <ul className="space-y-2">
        {invitations.map((item) => {
          const key = pendingItemKey(item)
          const gymName =
            item.kind === 'membershipRequest' ? item.data.gym.name : item.data.gym?.name ?? null
          const inviterLabel =
            item.kind === 'membershipRequest'
              ? formatInviter(item.data.invitedBy)
              : formatInviter(item.data.invitedBy)
          return (
            <InvitationCard
              key={key}
              gymName={gymName}
              roleToGrant={item.data.roleToGrant}
              inviterLabel={inviterLabel}
              createdAt={item.data.createdAt}
              isActing={actingOn === key}
              onAccept={() => handle('accept', item)}
              onDecline={() => handle('decline', item)}
            />
          )
        })}
      </ul>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </section>
  )
}
