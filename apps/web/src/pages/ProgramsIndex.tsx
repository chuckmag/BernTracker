import { useEffect, useMemo, useState } from 'react'
import { api, type GymProgram } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import ProgramList from '../components/ProgramList'

export default function ProgramsIndex() {
  const { gymId, gymRole } = useGym()
  const [gymPrograms, setGymPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Programs</h1>
        <p className="text-slate-500 dark:text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <ProgramList
      scope={scope}
      items={gymPrograms.map((gp) => ({ program: gp.program, isDefault: gp.isDefault }))}
      loading={loading}
      error={error}
      detailBasePath="/programs"
      onCreated={load}
      heading="h1"
    />
  )
}
