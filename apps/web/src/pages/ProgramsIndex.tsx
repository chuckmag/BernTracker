import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type GymProgram, type Program } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import { VisibilityBadge, DefaultBadge } from './ProgramDetail'

function formatDateRange(start: string, end: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start).toLocaleDateString(undefined, opts)
  if (!end) return `From ${s}`
  const e = new Date(end).toLocaleDateString(undefined, opts)
  return `${s} – ${e}`
}

export default function ProgramsIndex() {
  const { gymId, gymRole } = useGym()
  const [gymPrograms, setGymPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const canWrite = gymRole === 'OWNER' || gymRole === 'PROGRAMMER'

  useEffect(() => {
    if (!gymId) return
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [gymId])

  async function load(signal?: { cancelled: boolean }) {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const list = await api.gyms.programs.list(gymId)
      if (!signal?.cancelled) setGymPrograms(list)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  function handleCreated(_created: Program) {
    setDrawerOpen(false)
    load()
  }

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Programs</h1>
        <p className="text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Programs</h1>
          <span className="bg-gray-700 text-sm px-2 py-0.5 rounded-full">{gymPrograms.length}</span>
        </div>
        {canWrite && (
          <Button variant="primary" onClick={() => setDrawerOpen(true)}>
            + New Program
          </Button>
        )}
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && gymPrograms.length === 0 && !error && (
        <EmptyState
          title="No programs yet"
          body="Create a program to organize workouts into a named block you can filter by and assign members to."
          cta={canWrite ? { label: '+ New Program', onClick: () => setDrawerOpen(true) } : undefined}
        />
      )}

      {gymPrograms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {gymPrograms.map((gp) => (
            <ProgramCard key={gp.program.id} program={gp.program} isDefault={gp.isDefault} />
          ))}
        </div>
      )}

      <ProgramFormDrawer
        gymId={gymId}
        canSetDefault={gymRole === 'OWNER'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleCreated}
      />
    </div>
  )
}

function ProgramCard({ program, isDefault }: { program: Program; isDefault: boolean }) {
  const stripe = program.coverColor ?? '#374151'
  const memberCount = program._count?.members ?? 0
  const workoutCount = program._count?.workouts ?? 0
  return (
    <Link
      to={`/programs/${program.id}`}
      className="group bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-gray-700 transition-colors"
    >
      <div style={{ backgroundColor: stripe }} className="h-1.5 w-full" />
      <div className="p-4">
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="font-semibold text-white truncate group-hover:text-indigo-300 transition-colors flex-1 min-w-0">
            {program.name}
          </h3>
          {isDefault && <DefaultBadge className="shrink-0" />}
          <VisibilityBadge visibility={program.visibility} className="shrink-0" />
        </div>
        {program.description && (
          <p className="mt-1 text-xs text-gray-400 line-clamp-2">{program.description}</p>
        )}
        <p className="mt-3 text-xs text-gray-400">{formatDateRange(program.startDate, program.endDate)}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
          <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          <span className="text-gray-700" aria-hidden="true">·</span>
          <span>{workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'}</span>
        </div>
      </div>
    </Link>
  )
}
