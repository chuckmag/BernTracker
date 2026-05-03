import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { useGym } from '../context/GymContext.tsx'
import ProgramFilterPicker from './ProgramFilterPicker.tsx'

// Browse Gyms moved into the TopBar gym picker — no standalone sidebar entry.
const memberLinks = [
  { to: '/feed',             label: 'Feed'             },
  { to: '/history',          label: 'History'          },
  { to: '/personal-program', label: 'Personal Program' },
]

// Members consolidated into /gym-settings#members (slice D1) — no standalone link.
const staffLinks = [
  { to: '/calendar',     label: 'Calendar' },
  { to: '/programs',     label: 'Programs' },
  { to: '/gym-settings', label: 'Gym Settings' },
]

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth()
  const { gymRole } = useGym()
  const navigate = useNavigate()

  async function handleSignOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  const isStaff = gymRole && gymRole !== 'MEMBER'

  const navContent = (
    <>
      <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">WODalytics</span>
        <button
          onClick={onClose}
          className="md:hidden text-gray-500 hover:text-white text-xl leading-none"
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <ProgramFilterPicker />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {memberLinks.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}

        {isStaff && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs text-gray-400 uppercase tracking-widest">Staff</span>
            </div>
            {staffLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800">
        <p className="truncate text-xs text-gray-400 mb-2">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: static sidebar, always visible */}
      <aside className="hidden md:flex w-64 shrink-0 bg-gray-900 flex-col">
        {navContent}
      </aside>

      {/* Mobile: overlay drawer, controlled by isOpen */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            aria-hidden="true"
          />
          <aside
            className="relative w-72 h-full bg-gray-900 flex flex-col shadow-2xl"
            aria-label="Navigation menu"
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
