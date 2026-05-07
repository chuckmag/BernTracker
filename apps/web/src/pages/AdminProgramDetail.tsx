import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Program, Workout } from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import Button from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import ProgramOverviewMeta from '../components/ProgramOverviewMeta'
import ProgramMembersTab from '../components/ProgramMembersTab'
import ProgramFormDrawer from '../components/ProgramFormDrawer'
import WorkoutDrawer from '../components/WorkoutDrawer'
import { VisibilityBadge } from './ProgramDetail'

/**
 * WODalytics admin: program detail with the same Overview / Members / Workouts
 * tab structure as the gym-scoped ProgramDetail (#160). The Members tab is
 * view-only (canManage=false) — there is no gym roster to invite from. The
 * Workouts tab has full editing via WorkoutDrawer, which gym detail defers to
 * a later slice.
 */

type Tab = 'overview' | 'members' | 'workouts'

export default function AdminProgramDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [program, setProgram] = useState<Program | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
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
      navigate('/admin/settings#programs', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  function openCreateWorkout() {
    setEditingWorkout(undefined)
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
        <Link to="/admin/settings#programs" className="text-primary hover:opacity-80 text-sm">← Back to WODalytics Settings</Link>
      </div>
    )
  }

  const stripe = program.coverColor ?? '#374151'
  const memberCount = program._count?.members ?? 0

  return (
    <div>
      <div className="mb-4">
        <Link to="/admin/settings#programs" className="text-xs text-primary hover:opacity-80">← WODalytics Settings</Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        <div style={{ backgroundColor: stripe }} className="w-1.5 h-12 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{program.name}</h1>
            <VisibilityBadge visibility={program.visibility} />
          </div>
          {program.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{program.description}</p>
          )}
        </div>
        <Button variant="secondary" onClick={() => setProgramDrawerOpen(true)}>Edit</Button>
      </div>

      <div className="border-b border-slate-200 dark:border-gray-800 mb-6">
        <nav className="flex gap-1">
          {(['overview', 'members', 'workouts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors flex items-center gap-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                tab === t
                  ? 'border-primary text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
              ].join(' ')}
            >
              {t}
              {t === 'members' && memberCount > 0 && (
                <span className="text-[10px] bg-slate-200 dark:bg-gray-800 text-slate-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">
                  {memberCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {tab === 'overview' && (
        <>
          <ProgramOverviewMeta
            program={program}
            onOpenMembers={() => setTab('members')}
          />
          <div className="mt-10 pt-6 border-t border-slate-200 dark:border-gray-800">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mb-3">Danger zone</h3>
            <Button variant="destructive" onClick={handleDeleteProgram} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete program'}
            </Button>
          </div>
        </>
      )}

      {tab === 'members' && (
        <ProgramMembersTab
          programId={program.id}
          gymId=""
          canManage={false}
          onMembershipChanged={refreshAfterMutation}
        />
      )}

      {tab === 'workouts' && (
        <>
          <div className="flex justify-end mb-3">
            <Button variant="primary" onClick={openCreateWorkout}>+ New Workout</Button>
          </div>
          {workouts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-gray-500">No workouts yet.</p>
          ) : (
            <ul className="space-y-2">
              {workouts.map((w) => (
                <AdminWorkoutRow key={w.id} workout={w} onClick={() => openEditWorkout(w)} />
              ))}
            </ul>
          )}
        </>
      )}

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
        className="w-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg p-3 flex items-start gap-3 text-left hover:border-slate-300 dark:hover:border-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
      >
        <span
          className={`shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-md text-xs font-bold ${style.bg} ${style.tint}`}
          aria-label={style.label}
        >
          {style.abbr}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-slate-950 dark:text-white truncate">{workout.title}</h3>
            {workout.status === 'DRAFT' && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                Draft
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{date}</p>
        </div>
      </button>
    </li>
  )
}
