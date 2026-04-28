import { useState } from 'react'
import { useInvitations } from '../context/InvitationsContext.tsx'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

function inviterDisplayName(invitedBy: { firstName: string | null; lastName: string | null; name: string | null; email: string } | null): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (invitedBy.name?.trim()) return invitedBy.name.trim()
  return invitedBy.email
}

export default function MyInvitationsSection() {
  const { invitations, accept, decline } = useInvitations()
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(action: 'accept' | 'decline', id: string) {
    setActingOn(id)
    setError(null)
    try {
      if (action === 'accept') await accept(id)
      else await decline(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} invitation`)
    } finally {
      setActingOn(null)
    }
  }

  return (
    <section id="invitations" className="space-y-3 scroll-mt-16">
      <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Invitations</h2>
      {invitations.length === 0 ? (
        <EmptyState title="No pending invitations" body="When a gym invites you, it'll show up here." />
      ) : (
        <ul className="space-y-2">
          {invitations.map((inv) => (
            <li key={inv.id} className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm text-white">
                  <span className="font-semibold">{inv.gym.name}</span>
                  <span className="text-gray-400"> invited you as </span>
                  <span className="text-indigo-300">{ROLE_LABEL[inv.roleToGrant] ?? inv.roleToGrant}</span>
                </p>
                <p className="text-xs text-gray-400">
                  From {inviterDisplayName(inv.invitedBy)} · {new Date(inv.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handle('accept', inv.id)} disabled={actingOn === inv.id}>
                  {actingOn === inv.id ? 'Accepting…' : 'Accept'}
                </Button>
                <Button variant="secondary" onClick={() => handle('decline', inv.id)} disabled={actingOn === inv.id}>
                  Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </section>
  )
}
