import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Program, Workout } from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Skeleton from '../components/ui/Skeleton'
import ProgramOverviewMeta from '../components/ProgramOverviewMeta'
import { VisibilityBadge } from './ProgramDetail'

/**
 * WODalytics admin: program detail + workouts list (#160).
 * Mounted at `/admin/programs/:id`. Read-only in slice 2; edit affordances
 * land in slice 3 along with the shared editor components driven by the
 * `ProgramScope` adapter.
 *
 * Reuses `ProgramOverviewMeta` and `VisibilityBadge` so the visual surface
 * matches the gym-scoped `ProgramDetail` page exactly. The data shape
 * differs (admin gets `Program`, gym path gets `GymProgram`) but the
 * components only see fields that exist on both.
 */
export default function AdminProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const [program, setProgram] = useState<Program | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const signal = { cancelled: false }
    load(id, signal)
    return () => { signal.cancelled = true }
  }, [id])

  async function load(programId: string, signal?: { cancelled: boolean }) {
    setLoading(true)
    setError(null)
    try {
      const [p, ws] = await Promise.all([
        adminProgramScope.get(programId),
        adminProgramScope.listWorkouts(programId),
      ])
      if (!signal?.cancelled) {
        setProgram(p)
        setWorkouts(ws)
      }
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  if (loading) return <Skeleton variant="feed-row" count={3} />

  if (!program) {
    return (
      <div>
        <p className="text-red-400 mb-3">{error ?? 'Program not found.'}</p>
        <Link to="/admin/programs" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Admin · Programs</Link>
      </div>
    )
  }

  const stripe = program.coverColor ?? '#374151'

  return (
    <div>
      <div className="mb-4">
        <Link to="/admin/programs" className="text-xs text-indigo-400 hover:text-indigo-300">← Admin · Programs</Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div style={{ backgroundColor: stripe }} className="w-1.5 h-12 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{program.name}</h1>
            <VisibilityBadge visibility={program.visibility} />
          </div>
          {program.description && (
            <p className="mt-1 text-sm text-gray-400">{program.description}</p>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <ProgramOverviewMeta program={program} />

      <section>
        <h2 className="text-lg font-semibold mb-3">Workouts</h2>
        {workouts.length === 0 ? (
          <p className="text-sm text-gray-500">No workouts yet.</p>
        ) : (
          <ul className="space-y-2">
            {workouts.map((w) => (
              <AdminWorkoutRow key={w.id} workout={w} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AdminWorkoutRow({ workout }: { workout: Workout }) {
  const style = WORKOUT_TYPE_STYLES[workout.type]
  const date = new Date(workout.scheduledAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3">
      <span
        className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-md text-xs font-bold ${style.bg} ${style.tint}`}
        aria-label={style.label}
      >
        {style.abbr}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium text-white truncate">{workout.title}</h3>
          {workout.status === 'DRAFT' && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
              Draft
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{date}</p>
      </div>
    </li>
  )
}
