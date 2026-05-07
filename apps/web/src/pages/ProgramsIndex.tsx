import { useEffect, useMemo, useState } from 'react'
import { api, type GymProgram, type Program } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import ProgramCard from '../components/ProgramCard'

export default function ProgramsIndex() {
  const { gymId, gymRole } = useGym()
  const [gymPrograms, setGymPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const canWrite = gymRole === 'OWNER' || gymRole === 'PROGRAMMER'
  const scope = useMemo(
    () => makeGymProgramScope({ gymId: gymId ?? '', gymRole: gymRole ?? null }),
    [gymId, gymRole],
  )

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
        <p className="text-slate-500 dark:text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Programs</h1>
          <span className="bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-200 text-sm px-2 py-0.5 rounded-full">{gymPrograms.length}</span>
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
            <ProgramCard
              key={gp.program.id}
              program={gp.program}
              to={`/programs/${gp.program.id}`}
              isDefault={gp.isDefault}
            />
          ))}
        </div>
      )}

      <ProgramFormDrawer
        scope={scope}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleCreated}
      />
    </div>
  )
}
