import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type GymProgram, type Program } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import ProgramFormDrawer from '../components/ProgramFormDrawer'

type Tab = 'overview' | 'members' | 'workouts'

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const { gymRole } = useGym()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<GymProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canWrite = gymRole === 'OWNER' || gymRole === 'PROGRAMMER'
  const canDelete = gymRole === 'OWNER'

  useEffect(() => {
    if (!id) return
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [id])

  async function load(signal?: { cancelled: boolean }) {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.programs.get(id)
      if (!signal?.cancelled) setDetail(data)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  function handleSaved(_updated: Program) {
    setDrawerOpen(false)
    load()
  }

  async function handleDelete() {
    if (!detail) return
    if (!window.confirm(`Delete program "${detail.program.name}"? This cannot be undone. Workouts will remain but become unassigned.`)) return
    setDeleting(true)
    setError(null)
    try {
      await api.programs.delete(detail.program.id)
      navigate('/programs', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  if (loading) return <Skeleton variant="feed-row" count={3} />

  if (!detail) {
    return (
      <div>
        <p className="text-red-400 mb-3">{error ?? 'Program not found.'}</p>
        <Link to="/programs" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Programs</Link>
      </div>
    )
  }

  const { program } = detail
  const stripe = program.coverColor ?? '#374151'

  return (
    <div>
      <div className="mb-4">
        <Link to="/programs" className="text-xs text-indigo-400 hover:text-indigo-300">← Programs</Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div style={{ backgroundColor: stripe }} className="w-1.5 h-12 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{program.name}</h1>
          {program.description && (
            <p className="mt-1 text-sm text-gray-400">{program.description}</p>
          )}
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Edit</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 mb-6">
        <nav className="flex gap-1">
          {(['overview', 'members', 'workouts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                tab === t
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {tab === 'overview' && <OverviewTab program={program} canWrite={canWrite} />}
      {tab === 'members' && <ComingSoon label="Member invite and management" />}
      {tab === 'workouts' && <ComingSoon label="Program-filtered workout list and bulk upload" />}

      {canDelete && tab === 'overview' && (
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3">Danger zone</h3>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete program'}
          </Button>
        </div>
      )}

      <ProgramFormDrawer
        gymId={detail.gymId}
        program={program}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  )
}

function OverviewTab({ program, canWrite }: { program: Program; canWrite: boolean }) {
  const memberCount = program._count?.members ?? 0
  const workoutCount = program._count?.workouts ?? 0
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm mb-8">
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Start date</dt>
          <dd className="text-white">{fmt(program.startDate)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">End date</dt>
          <dd className="text-white">{fmt(program.endDate)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Members</dt>
          <dd className="text-white">{memberCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Workouts</dt>
          <dd className="text-white">{workoutCount}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Link to={`/feed?programIds=${program.id}`}>
          <Button variant="secondary">Open in Feed</Button>
        </Link>
        {canWrite && (
          <Link to={`/calendar?programIds=${program.id}`}>
            <Button variant="secondary">Open in Calendar</Button>
          </Link>
        )}
      </div>
    </>
  )
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="text-center py-12 border border-dashed border-gray-800 rounded-lg">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-1 text-xs text-gray-400">Coming in a later slice of #82</p>
    </div>
  )
}
