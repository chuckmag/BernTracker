import { useEffect, useMemo, useState, useCallback } from 'react'
import { api, type PersonalProgram } from '../lib/api'
import { makePersonalProgramScope } from '../lib/personalProgramScope'
import WorkoutCalendarBoard from '../components/WorkoutCalendarBoard'

export default function PersonalProgramPage() {
  const [program, setProgram] = useState<PersonalProgram | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.me.personalProgram.get()
      .then((p) => { if (!cancelled) setProgram(p) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load personal program')
      })
    return () => { cancelled = true }
  }, [])

  const scope = useMemo(
    () => program ? makePersonalProgramScope({ program }) : null,
    [program],
  )

  const loadWorkouts = useCallback(async (from: string, to: string) => {
    return api.me.personalProgram.workouts.list({ from, to })
  }, [])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Personal Program</h1>
        <p className="text-rose-400 text-sm">{error}</p>
      </div>
    )
  }

  if (!program || !scope) {
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Personal Program</h1>
        <p className="text-slate-400 dark:text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Personal Program</h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">
          Your private workouts — only you can see or edit these. Click any day to plan a workout.
        </p>
      </header>

      <WorkoutCalendarBoard
        loadWorkouts={loadWorkouts}
        scope={scope}
        // The drawer's reorder controls are role-gated for gym scope; for
        // personal we want them on regardless of any gym role the user holds.
        userGymRole="OWNER"
        defaultProgramId={program.id}
      />
    </div>
  )
}
