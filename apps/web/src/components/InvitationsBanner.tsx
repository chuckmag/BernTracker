import { Link } from 'react-router-dom'
import { useInvitations } from '../context/InvitationsContext.tsx'

export default function InvitationsBanner() {
  const { invitations } = useInvitations()
  if (invitations.length === 0) return null

  const count = invitations.length
  const label = count === 1 ? '1 pending invitation' : `${count} pending invitations`

  return (
    <div className="bg-primary/15 border-b border-primary/40 text-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <span className="text-primary">
          You have {label}.
        </span>
        <Link
          to="/profile#invitations"
          className="text-primary hover:opacity-80 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 rounded px-2 py-0.5"
        >
          View →
        </Link>
      </div>
    </div>
  )
}
