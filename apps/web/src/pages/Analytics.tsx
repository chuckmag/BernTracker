import { useEffect, useState } from 'react'
import { api, type ConsistencyData } from '../lib/api.ts'
import ConsistencyCard from '../components/ConsistencyCard.tsx'
import Skeleton from '../components/ui/Skeleton.tsx'
import Button from '../components/ui/Button.tsx'

export default function Analytics() {
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.me.analytics.consistency(16)
      .then(setConsistency)
      .catch((e: Error) => setError(e.message ?? 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">WODalytics</h1>
        <div className="flex gap-2">
          <Button variant="secondary" disabled>Compare</Button>
          <Button variant="secondary" disabled>Export</Button>
        </div>
      </div>

      {loading && <Skeleton variant="feed-row" count={1} />}

      {!loading && error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {!loading && !error && consistency && (
        <div className="grid grid-cols-1 gap-5">
          <ConsistencyCard data={consistency} weeks={16} />
        </div>
      )}
    </div>
  )
}
