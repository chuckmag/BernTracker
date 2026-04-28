import { Link } from 'react-router-dom'
import { useGym } from '../context/GymContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import AvatarPlaceholder from './AvatarPlaceholder'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { gyms, gymId, setGymId } = useGym()
  const { user } = useAuth()

  function handleGymChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setGymId(e.target.value)
  }

  const displayName = user?.firstName || user?.name?.split(' ')[0] || user?.email || 'You'

  return (
    <header className="h-12 flex items-center px-4 border-b border-gray-800 bg-gray-950 shrink-0">
      <button
        onClick={onMenuClick}
        className="md:hidden mr-3 p-1 text-gray-400 hover:text-white transition-colors"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect y="3" width="20" height="2" rx="1" />
          <rect y="9" width="20" height="2" rx="1" />
          <rect y="15" width="20" height="2" rx="1" />
        </svg>
      </button>

      <div className="flex-1 flex items-center justify-end gap-3">
        {gyms.length === 0 ? (
          <Link to="/gym-settings" className="text-sm text-indigo-400 hover:text-indigo-300">
            Set up a gym →
          </Link>
        ) : gyms.length === 1 ? (
          <span className="text-sm text-gray-300">{gyms[0].name}</span>
        ) : (
          <select
            value={gymId ?? ''}
            onChange={handleGymChange}
            aria-label="Select gym"
            className="text-sm bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 focus:outline-none focus:border-indigo-500"
          >
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}

        {user && (
          <Link
            to="/profile"
            aria-label="Your profile"
            title={displayName}
            className="flex items-center gap-2 rounded-full pl-1 pr-3 py-0.5 hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            <AvatarPlaceholder firstName={user.firstName} lastName={user.lastName} email={user.email} size="sm" />
            <span className="hidden sm:inline text-sm text-gray-300">{displayName}</span>
          </Link>
        )}
      </div>
    </header>
  )
}
