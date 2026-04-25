import { Link } from 'react-router-dom'
import { useGym } from '../context/GymContext.tsx'

interface TopBarProps {
  onMenuClick: () => void
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { gyms, gymId, setGymId } = useGym()

  function handleGymChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setGymId(e.target.value)
  }

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

      <div className="flex-1 flex justify-end">
        {gyms.length === 0 ? (
          <Link to="/settings" className="text-sm text-indigo-400 hover:text-indigo-300">
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
      </div>
    </header>
  )
}
