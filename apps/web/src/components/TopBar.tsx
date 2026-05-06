import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import Avatar from './Avatar'
import GymPicker from './GymPicker'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user } = useAuth()

  const displayName = user?.firstName || user?.name?.split(' ')[0] || user?.email || 'You'

  return (
    <header className="h-12 flex items-center px-4 border-b border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
      <button
        onClick={onMenuClick}
        className="md:hidden mr-3 p-1 text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white transition-colors"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect y="3" width="20" height="2" rx="1" />
          <rect y="9" width="20" height="2" rx="1" />
          <rect y="15" width="20" height="2" rx="1" />
        </svg>
      </button>

      <div className="flex-1 flex items-center justify-end gap-3">
        <GymPicker />

        {user && (
          <Link
            to="/profile"
            aria-label="Your profile"
            title={displayName}
            className="flex items-center gap-2 rounded-full pl-1 pr-3 py-0.5 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
          >
            <Avatar avatarUrl={user.avatarUrl} firstName={user.firstName} lastName={user.lastName} email={user.email} size="sm" />
            <span className="hidden sm:inline text-sm text-slate-600 dark:text-gray-300">{displayName}</span>
          </Link>
        )}
      </div>
    </header>
  )
}
