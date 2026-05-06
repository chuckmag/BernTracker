import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { useGym } from '../context/GymContext.tsx'
import ProgramFilterPicker from './ProgramFilterPicker.tsx'

// Browse Gyms moved into the TopBar gym picker — no standalone sidebar entry.
const memberLinks: { to: string; label: string; logo?: string }[] = [
  { to: '/dashboard',        label: 'Dashboard'        },
  { to: '/feed',             label: 'Feed'             },
  { to: '/history',          label: 'History'          },
  { to: '/personal-program', label: 'Personal Program' },
  { to: '/wodalytics',       label: 'WODalytics',      logo: '/favicon-96x96.png' },
]

// Members consolidated into /gym-settings#members (slice D1) — no standalone link.
const staffLinks = [
  { to: '/calendar',     label: 'Calendar' },
  { to: '/programs',     label: 'Programs' },
  { to: '/gym-settings', label: 'Gym Settings' },
]

// WODalytics admin (#160) — visible only to users on the WODALYTICS_ADMIN_EMAILS
// allowlist (server checks via requireWodalyticsAdmin). Single entry point;
// the page itself has hash-anchor tabs for Programs and Movements (mirrors
// the GymSettings details/members tab pattern). Labelled "WODalytics
// Settings" (not just "Settings") so it's never confused with the per-gym
// "Gym Settings" entry in the Staff section.
const adminLinks = [
  { to: '/admin/settings', label: 'WODalytics Settings' },
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
      <div className="px-6 py-5 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">WODalytics</span>
        <button
          onClick={onClose}
          className="md:hidden text-slate-500 dark:text-gray-500 hover:text-slate-950 dark:hover:text-white text-xl leading-none"
          aria-label="Close menu"
        >
          ×
        </button>
      </div>

      <ProgramFilterPicker />

      <nav className="flex-1 px-3 py-4 space-y-1">
        {memberLinks.map(({ to, label, logo }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-200 text-slate-950 dark:bg-gray-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
              ].join(' ')
            }
          >
            {logo
              ? <img src={logo} alt={label} className="-my-2 h-9 w-9 object-contain flex-shrink-0" />
              : label
            }
          </NavLink>
        ))}

        {isStaff && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-widest">Staff</span>
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
                      ? 'bg-slate-200 text-slate-950 dark:bg-gray-800 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </>
        )}

        {user?.isWodalyticsAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <span className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-widest">Admin</span>
            </div>
            {adminLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-200 text-slate-950 dark:bg-gray-800 dark:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-slate-200 dark:border-gray-800">
        <p className="truncate text-xs text-slate-500 dark:text-gray-400 mb-2">{user?.email}</p>
        <button
          onClick={handleSignOut}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: static sidebar, always visible */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white dark:bg-gray-900 flex-col">
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
            className="relative w-72 h-full bg-white dark:bg-gray-900 flex flex-col shadow-2xl"
            aria-label="Navigation menu"
          >
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
