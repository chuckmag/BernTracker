import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Program, Workout } from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import ProgramOverviewMeta from '../components/ProgramOverviewMeta'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import WorkoutDrawer from '../components/WorkoutDrawer'
import { VisibilityBadge } from './ProgramDetail'

/**
 * WODalytics admin: program detail + workouts list with edit affordances (#160).
 * Mounted at `/admin/programs/:id`. The shared `ProgramFormDrawer` and
 * `WorkoutDrawer` components handle the actual editing — they receive
 * `adminProgramScope` and adapt their UI to the admin context (no gym-default
 * toggle, no draft/publish flow, no workout reorder).
 *
 * Reuses `ProgramOverviewMeta` and `VisibilityBadge` so the visual surface
 * matches the gym-scoped `ProgramDetail` page exactly.
 */
export default function AdminProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [program, setProgram] = useState<Program | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [programDrawerOpen, setProgramDrawerOpen] = useState(false)
  const [workoutDrawerKey, setWorkoutDrawerKey] = useState<string | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<Workout | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)

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

  function refreshAfterMutation() {
    if (id) load(id)
  }

  function handleProgramSaved(updated: Program) {
    setProgramDrawerOpen(false)
    setProgram(updated)
    if (id) load(id)
  }

  async function handleDeleteProgram() {
    if (!program) return
    if (!window.confirm(`Delete program "${program.name}"? This cannot be undone. ${workouts.length} workout${workouts.length === 1 ? '' : 's'} will be deleted along with it.`)) return
    setDeleting(true)
    setError(null)
    try {
      await adminProgramScope.deleteProgram(program.id)
      navigate('/admin/programs', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  function openCreateWorkout() {
    setEditingWorkout(undefined)
    // Default new workouts to today's date — admins can pick any date in
    // the drawer, but every code path needs a non-null dateKey to render.
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    setWorkoutDrawerKey(`${y}-${m}-${d}`)
  }

  function openEditWorkout(w: Workout) {
    setEditingWorkout(w)
    setWorkoutDrawerKey(w.scheduledAt.slice(0, 10))
  }

  function closeWorkoutDrawer() {
    setWorkoutDrawerKey(null)
    setEditingWorkout(undefined)
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
        <Button variant="secondary" onClick={() => setProgramDrawerOpen(true)}>Edit</Button>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <ProgramOverviewMeta program={program} />

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Workouts</h2>
          <Button variant="primary" onClick={openCreateWorkout}>+ New Workout</Button>
        </div>
        {workouts.length === 0 ? (
          <p className="text-sm text-gray-500">No workouts yet.</p>
        ) : (
          <ul className="space-y-2">
            {workouts.map((w) => (
              <AdminWorkoutRow key={w.id} workout={w} onClick={() => openEditWorkout(w)} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 pt-6 border-t border-gray-800">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 mb-3">Danger zone</h3>
        <Button variant="destructive" onClick={handleDeleteProgram} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete program'}
        </Button>
      </div>

      <ProgramFormDrawer
        scope={adminProgramScope}
        program={program}
        open={programDrawerOpen}
        onClose={() => setProgramDrawerOpen(false)}
        onSaved={handleProgramSaved}
      />

      <WorkoutDrawer
        scope={adminProgramScope}
        dateKey={workoutDrawerKey}
        workout={editingWorkout}
        defaultProgramId={program.id}
        onClose={closeWorkoutDrawer}
        onSaved={() => { closeWorkoutDrawer(); refreshAfterMutation() }}
      />
    </div>
  )
}

interface AdminWorkoutRowProps {
  workout: Workout
  onClick: () => void
}

function AdminWorkoutRow({ workout, onClick }: AdminWorkoutRowProps) {
  const style = WORKOUT_TYPE_STYLES[workout.type]
  const date = new Date(workout.scheduledAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-start gap-3 text-left hover:border-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
      >
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
      </button>
    </li>
  )
}
