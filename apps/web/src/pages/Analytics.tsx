import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, type ConsistencyData, type TrackedMovement } from '../lib/api.ts'
import ConsistencyCard from '../components/ConsistencyCard.tsx'
import StrengthPRCard from '../components/StrengthPRCard.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import Button from '../components/ui/Button.tsx'

type WodTab = 'summary' | 'movements' | 'benchmarks'

const TAB_PATHS: Record<WodTab, string> = {
  summary: '/wodalytics',
  movements: '/wodalytics/movements',
  benchmarks: '/wodalytics/benchmarks',
}

const TAB_LABELS: Record<WodTab, string> = {
  summary: 'Summary',
  movements: 'Movements',
  benchmarks: 'Benchmarks',
}

function resolveTab(pathname: string): WodTab {
  if (pathname.startsWith('/wodalytics/movements')) return 'movements'
  if (pathname.startsWith('/wodalytics/benchmarks')) return 'benchmarks'
  return 'summary'
}

export default function Analytics() {
  const location = useLocation()
  const navigate = useNavigate()
  const tab = resolveTab(location.pathname)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">WODalytics</h1>
        {tab === 'summary' && (
          <div className="flex gap-2">
            <Button variant="secondary" disabled>Compare</Button>
            <Button variant="secondary" disabled>Export</Button>
          </div>
        )}
      </div>

      <div className="border-b border-slate-200 dark:border-gray-800 mb-6">
        <nav className="flex gap-1" role="tablist">
          {(Object.keys(TAB_PATHS) as WodTab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => navigate(TAB_PATHS[t])}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                tab === t
                  ? 'border-primary text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
              ].join(' ')}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'summary' ? <SummaryTab /> : <Outlet />}
    </div>
  )
}

function SummaryTab() {
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null)
  const [movements, setMovements] = useState<TrackedMovement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.me.analytics.consistency(16),
      api.me.analytics.trackedMovements(),
    ])
      .then(([c, m]) => {
        setConsistency(c)
        setMovements(m)
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton variant="feed-row" count={2} />
  if (error) return <p className="text-sm text-rose-400">{error}</p>

  return (
    <div className="grid grid-cols-1 gap-5">
      {movements && movements.length > 0 && <StrengthPRCard movements={movements} />}
      {consistency && <ConsistencyCard data={consistency} weeks={16} />}
    </div>
  )
}
