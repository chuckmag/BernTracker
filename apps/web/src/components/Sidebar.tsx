import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/calendar',  label: 'Calendar'  },
  { to: '/members',   label: 'Members'   },
  { to: '/settings',  label: 'Settings'  },
]

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-gray-900 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-800">
        <span className="text-lg font-bold tracking-tight">BernTracker</span>
        <span className="ml-2 text-xs text-gray-500 uppercase tracking-widest">Admin</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
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
      </nav>
    </aside>
  )
}
