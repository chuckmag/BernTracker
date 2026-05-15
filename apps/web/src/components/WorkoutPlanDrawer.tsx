import { useState } from 'react'
import type { LoadUnit, DistanceUnit, WorkoutLevel, Workout, UserWorkoutPlan, WorkoutMovementWithPrescription, Member } from '../lib/api.ts'
import { api } from '../lib/api.ts'
import Button from './ui/Button.tsx'

interface WorkoutPlanDrawerProps {
  workout: Workout
  targetUser: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string }
  existingPlan?: UserWorkoutPlan
  gymMembers?: Member[]
  onClose: () => void
  onSaved: (plan: UserWorkoutPlan) => void
  onDeleted?: () => void
}

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX',      label: 'RX' },
  { value: 'SCALED',  label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

// ─── Per-set row ───────────────────────────────────────────────────────────────

interface SetRow {
  reps: string
  load: string
  distance: string
  calories: string
  seconds: string
}

interface MovementSection {
  workoutMovementId: string
  movementName: string
  loadUnit: LoadUnit
  distanceUnit: DistanceUnit
  sets: SetRow[]
}

function blankSet(): SetRow {
  return { reps: '', load: '', distance: '', calories: '', seconds: '' }
}

function initSets(wm: WorkoutMovementWithPrescription, existingMovement?: UserWorkoutPlan['value'] extends null ? never : { sets: Array<{reps?: string; load?: string}> } | undefined): SetRow[] {
  const existingSets = (existingMovement as any)?.sets as Array<{ reps?: string; load?: string; distance?: number; calories?: number; seconds?: number }> | undefined
  if (existingSets?.length) {
    return existingSets.map((s) => ({
      reps:     s.reps ?? '',
      load:     s.load ?? '',
      distance: s.distance !== undefined ? String(s.distance) : '',
      calories: s.calories !== undefined ? String(s.calories) : '',
      seconds:  s.seconds !== undefined ? String(s.seconds) : '',
    }))
  }
  // Pre-fill from prescribed sets if no existing plan
  const count = wm.sets ?? 1
  return Array.from({ length: count }, () => ({
    reps:     wm.reps ?? '',
    load:     '',
    distance: wm.distance !== null && wm.distance !== undefined ? String(wm.distance) : '',
    calories: wm.calories !== null && wm.calories !== undefined ? String(wm.calories) : '',
    seconds:  wm.seconds !== null && wm.seconds !== undefined ? String(wm.seconds) : '',
  }))
}

function initSections(workout: Workout, existingPlan?: UserWorkoutPlan): MovementSection[] {
  return workout.workoutMovements.map((wm) => {
    const existing = existingPlan?.value?.movementResults?.find(
      (mr) => mr.workoutMovementId === wm.movement.id,
    )
    return {
      workoutMovementId: wm.movement.id,
      movementName:      wm.movement.name,
      loadUnit:          (existing?.loadUnit ?? wm.loadUnit ?? 'LB') as LoadUnit,
      distanceUnit:      (existing?.distanceUnit ?? wm.distanceUnit ?? 'M') as DistanceUnit,
      sets:              initSets(wm, existing as any),
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkoutPlanDrawer({
  workout,
  targetUser,
  existingPlan,
  onClose,
  onSaved,
  onDeleted,
}: WorkoutPlanDrawerProps) {
  const [level, setLevel] = useState<WorkoutLevel>(existingPlan?.level ?? 'RX')
  const [notes, setNotes] = useState<string>(existingPlan?.notes ?? '')
  const [sections, setSections] = useState<MovementSection[]>(() => initSections(workout, existingPlan))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userName = targetUser.firstName
    ? [targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ')
    : (targetUser.name ?? targetUser.email)

  function updateSet(sectionIdx: number, setIdx: number, field: keyof SetRow, val: string) {
    setSections((prev) => {
      const next = prev.map((s, si) =>
        si !== sectionIdx ? s : {
          ...s,
          sets: s.sets.map((r, ri) => ri !== setIdx ? r : { ...r, [field]: val }),
        },
      )
      return next
    })
  }

  function addSet(sectionIdx: number) {
    setSections((prev) =>
      prev.map((s, si) => si !== sectionIdx ? s : { ...s, sets: [...s.sets, blankSet()] }),
    )
  }

  function removeSet(sectionIdx: number, setIdx: number) {
    setSections((prev) =>
      prev.map((s, si) =>
        si !== sectionIdx ? s : { ...s, sets: s.sets.filter((_, ri) => ri !== setIdx) },
      ),
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const movementResults = sections
        .map((s) => {
          const sets = s.sets
            .map((row) => ({
              ...(row.reps     ? { reps:     row.reps }              : {}),
              ...(row.load     ? { load:     row.load }              : {}),
              ...(row.distance ? { distance: parseFloat(row.distance) } : {}),
              ...(row.calories ? { calories: parseInt(row.calories, 10) }  : {}),
              ...(row.seconds  ? { seconds:  parseInt(row.seconds, 10) }  : {}),
            }))
            .filter((s) => Object.keys(s).length > 0)

          return {
            workoutMovementId: s.workoutMovementId,
            loadUnit:          s.loadUnit,
            distanceUnit:      s.distanceUnit,
            sets,
          }
        })
        .filter((mr) => mr.sets.length > 0)

      const plan = await api.plans.upsert(workout.id, targetUser.id, {
        level,
        value:  movementResults.length > 0 ? { movementResults } : null,
        notes:  notes.trim() || null,
      })
      onSaved(plan)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!existingPlan) return
    if (!window.confirm(`Remove plan for ${userName}?`)) return
    setDeleting(true)
    setError(null)
    try {
      await api.plans.delete(workout.id, targetUser.id)
      onDeleted?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const showMovements = workout.workoutMovements.length > 0

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Overlay */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white dark:bg-gray-900 overflow-y-auto flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Plan for {userName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{workout.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close plan drawer"
            className="-mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-5 overflow-y-auto">
          {/* Level */}
          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">Level</p>
            <div className="flex gap-1.5 flex-wrap">
              {LEVELS.map(({ value: v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLevel(v)}
                  className={[
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    level === v
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-gray-700 hover:text-slate-950 dark:hover:text-white',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Movement prescriptions */}
          {showMovements && sections.map((section, si) => {
            const wm = workout.workoutMovements[si]
            const tracksLoad     = wm?.tracksLoad ?? true
            const hasDistance    = wm?.distance != null
            const hasCalories    = wm?.calories != null

            return (
              <div key={section.workoutMovementId} className="space-y-2">
                <p className="text-sm font-medium text-slate-950 dark:text-white">{section.movementName}</p>

                {/* Column headers */}
                <div className="grid gap-2 text-xs font-medium text-slate-500 dark:text-gray-400" style={{ gridTemplateColumns: 'auto 1fr 1fr auto' }}>
                  <span>Set</span>
                  <span>Reps</span>
                  {tracksLoad && <span>Load ({section.loadUnit})</span>}
                  {hasDistance && <span>Dist ({section.distanceUnit})</span>}
                  {hasCalories && <span>Cal</span>}
                  <span />
                </div>

                {section.sets.map((row, ri) => (
                  <div key={ri} className="grid items-center gap-2 text-sm" style={{ gridTemplateColumns: 'auto 1fr 1fr auto' }}>
                    <span className="text-slate-400 dark:text-gray-500 text-xs w-4">{ri + 1}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="—"
                      value={row.reps}
                      onChange={(e) => updateSet(si, ri, 'reps', e.target.value)}
                      className="bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                      aria-label={`Set ${ri + 1} reps for ${section.movementName}`}
                    />
                    {tracksLoad && (
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 135 or 135-155"
                        value={row.load}
                        onChange={(e) => updateSet(si, ri, 'load', e.target.value)}
                        className="bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                        aria-label={`Set ${ri + 1} load for ${section.movementName}`}
                      />
                    )}
                    {hasDistance && (
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="—"
                        value={row.distance}
                        onChange={(e) => updateSet(si, ri, 'distance', e.target.value)}
                        className="bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                        aria-label={`Set ${ri + 1} distance for ${section.movementName}`}
                      />
                    )}
                    {hasCalories && (
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="—"
                        value={row.calories}
                        onChange={(e) => updateSet(si, ri, 'calories', e.target.value)}
                        className="bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                        aria-label={`Set ${ri + 1} calories for ${section.movementName}`}
                      />
                    )}
                    <button
                      onClick={() => removeSet(si, ri)}
                      disabled={section.sets.length <= 1}
                      aria-label={`Remove set ${ri + 1}`}
                      className="-my-1 -mr-1 w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 dark:text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                    >
                      −
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => addSet(si)}
                  className="text-xs text-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                >
                  + Add set
                </button>
              </div>
            )
          })}

          {/* Notes */}
          <div>
            <label htmlFor="plan-notes" className="block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1.5">
              Notes for athlete
            </label>
            <textarea
              id="plan-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Focus on form over weight today…"
              rows={3}
              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:border-primary"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-800 shrink-0 space-y-2">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            className="w-full"
          >
            {saving ? 'Saving…' : 'Save Plan'}
          </Button>
          {existingPlan && onDeleted && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? 'Removing…' : 'Remove Plan'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
