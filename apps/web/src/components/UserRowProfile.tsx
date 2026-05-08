import { Link } from 'react-router-dom'
import Avatar from './Avatar'

export interface UserRowProfileUser {
  id: string
  firstName: string | null
  lastName: string | null
  name: string | null
  email: string
  avatarUrl: string | null
}

interface Props {
  user: UserRowProfileUser
}

export function displayNameOf(user: Pick<UserRowProfileUser, 'firstName' | 'lastName' | 'name' | 'email'>): string {
  if (user.firstName || user.lastName) return [user.firstName, user.lastName].filter(Boolean).join(' ')
  return user.name ?? user.email.split('@')[0]
}

// Renders a user's avatar (links to their public profile) and display name.
// Used in leaderboard rows and any other list that shows a user inline.
export default function UserRowProfile({ user }: Props) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Link
        to={`/users/${user.id}`}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
        aria-label={`View ${displayNameOf(user)}'s profile`}
      >
        <Avatar
          avatarUrl={user.avatarUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          email={user.email}
          size="sm"
        />
      </Link>
      <span className="flex-1 min-w-0 text-sm font-medium text-slate-950 dark:text-white truncate">
        {displayNameOf(user)}
      </span>
    </div>
  )
}
