import { useEffect, useMemo, useState } from 'react'
import { api, type BrowseGym, type GymBrowseStatus } from '../lib/api'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import GymLogo from '../components/GymLogo'

const STATUS_LABEL: Record<GymBrowseStatus, string> = {
  NONE: '',
  MEMBER: 'Already a member',
  REQUEST_PENDING: 'Request pending',
}

export default function BrowseGyms() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [gyms, setGyms] = useState<BrowseGym[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  // Debounce the search box so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setError(null)
    api.gyms.browse(debounced)
      .then((list) => { if (!cancelled) setGyms(list) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load gyms') })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [debounced])

  async function handleRequest(gymId: string) {
    setActingOnId(gymId)
    setError(null)
    try {
      await api.gyms.joinRequest.create(gymId)
      setGyms((prev) => prev.map((g) => g.id === gymId ? { ...g, callerStatus: 'REQUEST_PENDING' } : g))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send request')
    } finally {
      setActingOnId(null)
    }
  }

  async function handleCancel(gymId: string) {
    setActingOnId(gymId)
    setError(null)
    try {
      await api.gyms.joinRequest.cancel(gymId)
      setGyms((prev) => prev.map((g) => g.id === gymId ? { ...g, callerStatus: 'NONE' } : g))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel request')
    } finally {
      setActingOnId(null)
    }
  }

  const visibleEmpty = useMemo(() => hasLoaded && gyms.length === 0, [hasLoaded, gyms])

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Browse gyms</h1>
        <p className="text-sm text-slate-500 dark:text-gray-400">Find a gym to join. Staff approve your request before you become a member.</p>
      </header>

      <div>
        <label className="block">
          <span className="text-xs text-slate-600 dark:text-gray-400 mb-1 block">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gym name…"
            className="w-full bg-white border border-slate-300 dark:bg-gray-800 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!hasLoaded && <Skeleton variant="history-row" count={4} />}

      {visibleEmpty && (
        <EmptyState
          title={debounced.trim() ? `No gyms match "${debounced}"` : 'No gyms found'}
          body={debounced.trim() ? 'Try a different name or clear the search.' : 'Once gyms are created they\'ll show up here.'}
        />
      )}

      {hasLoaded && gyms.length > 0 && (
        <ul className="space-y-2">
          {gyms.map((g) => (
            <li
              key={g.id}
              className="rounded-xl bg-white border border-slate-200 dark:bg-gray-900 dark:border-gray-800 p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex items-center gap-3">
                <GymLogo logoUrl={g.logoUrl} name={g.name} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950 dark:text-white truncate">{g.name}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    {g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.timezone}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {g.callerStatus === 'NONE' && (
                  <Button
                    onClick={() => handleRequest(g.id)}
                    disabled={actingOnId === g.id}
                  >
                    {actingOnId === g.id ? 'Sending…' : 'Request to join'}
                  </Button>
                )}
                {g.callerStatus === 'REQUEST_PENDING' && (
                  <>
                    <span className="text-xs text-amber-300 bg-amber-500/20 rounded-full px-2 py-0.5">
                      {STATUS_LABEL[g.callerStatus]}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => handleCancel(g.id)}
                      disabled={actingOnId === g.id}
                    >
                      {actingOnId === g.id ? 'Cancelling…' : 'Cancel'}
                    </Button>
                  </>
                )}
                {g.callerStatus === 'MEMBER' && (
                  <span className="text-xs text-emerald-300 bg-emerald-500/20 rounded-full px-2 py-0.5">
                    {STATUS_LABEL[g.callerStatus]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
