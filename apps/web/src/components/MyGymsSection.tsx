import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type MyGym, type Role } from '../lib/api'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

const ROLE_TINT: Record<Role, string> = {
  OWNER: 'bg-primary/20 text-primary',
  PROGRAMMER: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  COACH: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  MEMBER: 'bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-gray-300',
}

// Lists the gyms the user is a member of on the /profile Memberships tab.
// EmptyState (with a CTA to Browse Gyms) when the user has no memberships
// yet — the most likely path for a new signup who hasn't joined anywhere.
export default function MyGymsSection() {
  const [gyms, setGyms] = useState<MyGym[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.me.gyms()
      .then((list) => { if (!cancelled) setGyms(list) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load gyms') })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Your gyms</h2>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!hasLoaded ? (
        <Skeleton variant="history-row" count={2} />
      ) : gyms.length === 0 ? (
        <EmptyState
          title="You're not a member of any gym yet"
          body="Browse gyms from the picker in the top right to find one to join."
        />
      ) : (
        <ul className="space-y-2">
          {gyms.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 px-4 py-3"
            >
              <p className="text-sm text-slate-950 dark:text-white truncate">{g.name}</p>
              <span className={['text-xs px-2 py-0.5 rounded-full shrink-0', ROLE_TINT[g.role]].join(' ')}>
                {ROLE_LABEL[g.role]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasLoaded && gyms.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-gray-500">
          Switch between gyms or find more from the gym picker in the top-right corner. Need to start a new gym?{' '}
          <Link to="/gyms/new" className="text-primary hover:opacity-80">Set one up</Link>.
        </p>
      )}
    </section>
  )
}
