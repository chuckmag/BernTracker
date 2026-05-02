import { useEffect, useState } from 'react'
import type { Program } from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import ProgramCard from '../components/ProgramCard'

/**
 * WODalytics admin: list of unaffiliated/public-catalog programs (#160).
 * Mounted at `/admin/programs`. Server gates via `requireWodalyticsAdmin`;
 * the web app additionally hides the route from the sidebar for non-admins.
 *
 * Uses the shared `ProgramCard` component, same as the gym-scoped Programs
 * page. The scope adapter (`adminProgramScope`) is the only piece that knows
 * we're on the admin path.
 */
export default function AdminProgramsIndex() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [])

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true)
    setError(null)
    try {
      const list = await adminProgramScope.list()
      if (!signal?.cancelled) setPrograms(list)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Admin · Programs</h1>
          <span className="bg-gray-700 text-sm px-2 py-0.5 rounded-full">{programs.length}</span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          Unaffiliated programs surfaced from public sources (e.g. CrossFit Mainsite). Editable by WODalytics staff.
        </p>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && programs.length === 0 && !error && (
        <EmptyState
          title="No unaffiliated programs"
          body="Programs imported from external sources will appear here once an ingest job runs."
        />
      )}

      {programs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((p) => (
            <ProgramCard key={p.id} program={p} to={`/admin/programs/${p.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
