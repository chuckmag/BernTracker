import { Link } from 'react-router-dom'
import { useInvitations } from '../context/InvitationsContext.tsx'

export default function InvitationsBanner() {
  const { invitations } = useInvitations()
  if (invitations.length === 0) return null

  const count = invitations.length
  const label = count === 1 ? '1 pending invitation' : `${count} pending invitations`

  return (
    <div className="bg-indigo-600/15 border-b border-indigo-600/40 text-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <span className="text-indigo-900 dark:text-indigo-100">
          You have {label}.
        </span>
        <Link
          to="/profile#invitations"
          className="text-indigo-700 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-200 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 rounded px-2 py-0.5"
        >
          View →
        </Link>
      </div>
    </div>
  )
}
