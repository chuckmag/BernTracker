import { useMemo, useState } from 'react'
import { deriveWorkoutGender } from '@wodalytics/types'
import { useAuth } from '../context/AuthContext.tsx'
import {
  api,
  apiFetch,
  TYPE_ABBR,
  type DistanceUnit,
  type LoadUnit,
  type Workout,
  type WorkoutLevel,
  type WorkoutMovementWithPrescription,
  type WorkoutResult,
} from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'

interface LogResultDrawerProps {
  workout: Workout
  existingResult?: WorkoutResult
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX',      label: 'RX' },
  { value: 'SCALED',  label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const REPS_REGEX = /^\d+(\.\d+)*$/                 // "10" or cluster "1.1.1"
const TEMPO_REGEX = /^[\dxX](\.[\dxX]){3}$/        // "3.1.1.0" or "x.0.x.0"

// ─── Logging mode ──────────────────────────────────────────────────────────────
// Strength workouts log per-movement sets tables. Metcons/MonoStructural log
// a single workout-level score. Skill/Warmup default to notes-only.

type LoggingMode = 'sets' | 'score' | 'notes-only'
type ScoreKind = 'ROUNDS_REPS' | 'TIME' | 'DISTANCE' | 'CALORIES'

function loggingModeFor(workout: Workout): LoggingMode {
  const category = WORKOUT_TYPE_STYLES[workout.type].category
  if (category === 'Strength') return 'sets'
  if (category === 'Metcon') return 'score'
  if (category === 'MonoStructural') return 'score'
  if (category === 'Skill Work') {
    return workout.workoutMovements.length > 0 ? 'sets' : 'notes-only'
  }
  return 'notes-only'
}

function scoreKindFor(workout: Workout): ScoreKind {
  if (workout.type === 'AMRAP') return 'ROUNDS_REPS'
  if (WORKOUT_TYPE_STYLES[workout.type].category === 'Metcon') return 'TIME'
  // MonoStructural — distance/cal/time all valid; pick by which prescription
  // the programmer filled in. Default to TIME.
  const wm = workout.workoutMovements[0]
  if (wm?.distance !== null && wm?.distance !== undefined) return 'DISTANCE'
  if (wm?.calories !== null && wm?.calories !== undefined) return 'CALORIES'
  return 'TIME'
}

// ─── Set-row state ─────────────────────────────────────────────────────────────
// Strings everywhere so partial / empty inputs are first-class. Coerced to
// numbers at submit time.

interface SetRow {
  reps: string
  load: string
  tempo: string
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

const EMPTY_SET: SetRow = { reps: '', load: '', tempo: '', distance: '', calories: '', seconds: '' }

function blankSet(): SetRow {
  return { ...EMPTY_SET }
}

// Seed `n` blank set rows, optionally pre-filled with the prescription
// (so the member only edits what differs from the prescription).
function seedSets(prescribed: WorkoutMovementWithPrescription, count: number): SetRow[] {
  const seed: SetRow = {
    reps:     prescribed.reps ?? '',
    load:     prescribed.load !== null ? String(prescribed.load) : '',
    tempo:    prescribed.tempo ?? '',
    distance: prescribed.distance !== null ? String(prescribed.distance) : '',
    calories: prescribed.calories !== null ? String(prescribed.calories) : '',
    seconds:  prescribed.seconds !== null ? String(prescribed.seconds) : '',
  }
  return Array.from({ length: count }, () => ({ ...seed }))
}

function initialMovementSections(workout: Workout, existing?: WorkoutResult): MovementSection[] {
  const ordered = [...workout.workoutMovements].sort((a, b) => a.displayOrder - b.displayOrder)
  const existingByWmId = new Map<string, { loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets?: Partial<SetRow>[] }>()
  if (existing) {
    const v = existing.value as { movementResults?: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets?: Partial<Record<keyof SetRow, number | string>>[] }[] }
    for (const mr of v.movementResults ?? []) {
      existingByWmId.set(mr.workoutMovementId, {
        loadUnit: mr.loadUnit,
        distanceUnit: mr.distanceUnit,
        sets: mr.sets?.map((s) => ({
          reps:     s.reps !== undefined ? String(s.reps) : '',
          load:     s.load !== undefined ? String(s.load) : '',
          tempo:    s.tempo !== undefined ? String(s.tempo) : '',
          distance: s.distance !== undefined ? String(s.distance) : '',
          calories: s.calories !== undefined ? String(s.calories) : '',
          seconds:  s.seconds !== undefined ? String(s.seconds) : '',
        })),
      })
    }
  }
  return ordered.map((wm) => {
    const prior = existingByWmId.get(wm.movement.id)
    const setCount = prior?.sets?.length ?? wm.sets ?? 1
    const seeded = seedSets(wm, setCount)
    const sets = prior?.sets
      ? prior.sets.map((s, i) => ({ ...seeded[i], ...s } as SetRow))
      : seeded
    return {
      workoutMovementId: wm.movement.id,
      movementName: wm.movement.name,
      loadUnit: prior?.loadUnit ?? wm.loadUnit ?? 'LB',
      distanceUnit: prior?.distanceUnit ?? wm.distanceUnit ?? 'M',
      sets,
    }
  })
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LogResultDrawer({ workout, existingResult, onClose, onSaved, onDeleted }: LogResultDrawerProps) {
  const { user } = useAuth()
  const isEdit = !!existingResult
  const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)

  const mode = loggingModeFor(workout)
  const scoreKind = scoreKindFor(workout)

  const [level, setLevel] = useState<WorkoutLevel>(existingResult?.level ?? 'RX')
  const [movements, setMovements] = useState<MovementSection[]>(() => initialMovementSections(workout, existingResult))
  const [activeMovement, setActiveMovement] = useState(0)
  const [scoreFields, setScoreFields] = useState(() => initialScoreFields(workout, existingResult, scoreKind))
  const [notes, setNotes] = useState(existingResult?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const styles = WORKOUT_TYPE_STYLES[workout.type]
  const canLogSets = mode === 'sets' && movements.length > 0

  function buildValue(): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    let movementResults: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[] = []
    if (canLogSets) {
      const built = buildMovementResults(movements)
      if (!built.ok) return built
      movementResults = built.results
    }
    let score: Record<string, unknown> | undefined
    if (mode === 'score') {
      const built = buildScore(scoreKind, scoreFields)
      if (!built.ok) return built
      score = built.score
    }
    if (mode === 'notes-only' && !notes.trim()) {
      // Notes-only types need at least *something* to record, but the
      // schema's refine rejects an empty value. Synthesize a zero-rep score
      // so the row is queryable.
      score = { kind: 'REPS', reps: 0 }
    }
    if (!score && movementResults.length === 0) {
      return { ok: false, error: 'Enter a score or at least one set.' }
    }
    return {
      ok: true,
      value: {
        ...(score ? { score } : {}),
        movementResults,
      },
    }
  }

  async function handleSubmit() {
    setError(null)
    setAlreadyLogged(false)
    const built = buildValue()
    if (!built.ok) { setError(built.error); return }

    setSubmitting(true)
    try {
      if (isEdit) {
        await api.results.update(existingResult.id, {
          level,
          value: built.value,
          notes: notes.trim() || null,
        })
        onSaved()
      } else {
        const res = await apiFetch(`/api/workouts/${workout.id}/results`, {
          method: 'POST',
          body: JSON.stringify({ level, workoutGender, value: built.value, notes: notes.trim() || undefined }),
        })
        if (res.status === 409) { setAlreadyLogged(true); return }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError((data as { error?: string }).error ?? 'Failed to log result.')
          return
        }
        onSaved()
      }
    } catch {
      setError('Failed to save result.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.results.delete(existingResult!.id)
      onDeleted?.()
    } catch {
      setError('Failed to delete result.')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  function updateSet(mIdx: number, sIdx: number, field: keyof SetRow, value: string) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      const sets = m.sets.map((s, j) => (j === sIdx ? { ...s, [field]: value } : s))
      return { ...m, sets }
    }))
  }

  function addSet(mIdx: number) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      const last = m.sets[m.sets.length - 1] ?? blankSet()
      // Carry over reps/load/tempo from the last row — most members repeat
      // them set to set, and clearing the cell is faster than retyping.
      return { ...m, sets: [...m.sets, { ...last }] }
    }))
  }

  function removeSet(mIdx: number, sIdx: number) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      if (m.sets.length <= 1) return m
      return { ...m, sets: m.sets.filter((_, j) => j !== sIdx) }
    }))
  }

  function setMovementUnit(mIdx: number, field: 'loadUnit' | 'distanceUnit', value: LoadUnit | DistanceUnit) {
    setMovements((prev) => prev.map((m, i) => (i === mIdx ? { ...m, [field]: value } : m)))
  }

  // ── Active movement (memoized so the table re-renders cleanly) ──────────────
  const active = useMemo(() => movements[activeMovement] ?? null, [movements, activeMovement])
  const activePrescription = useMemo(() => {
    if (!active) return null
    return workout.workoutMovements.find((wm) => wm.movement.id === active.workoutMovementId) ?? null
  }, [active, workout.workoutMovements])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md bg-gray-900 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold ${styles.bg} ${styles.tint}`}>
              {TYPE_ABBR[workout.type]}
            </span>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                {isEdit ? 'Edit Result' : 'Log Result'}
              </p>
              <p className="text-xs text-gray-400 leading-tight truncate max-w-[220px]">{workout.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-colors -my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center" aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {alreadyLogged && <p className="text-sm text-red-400">You've already logged this workout.</p>}
          {error && !alreadyLogged && <p className="text-sm text-red-400">{error}</p>}

          {/* Level */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Level</p>
            <div className="flex gap-1.5 flex-wrap">
              {LEVELS.map(({ value: v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLevel(v)}
                  className={[
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                    level === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sets table (Strength + Skill with prescription) */}
          {canLogSets && active && (
            <div className="space-y-3">
              {movements.length > 1 && (
                <div className="flex gap-1 overflow-x-auto -mx-1 px-1" role="tablist" aria-label="Movements">
                  {movements.map((m, i) => (
                    <button
                      key={m.workoutMovementId}
                      type="button"
                      role="tab"
                      aria-selected={i === activeMovement}
                      onClick={() => setActiveMovement(i)}
                      className={[
                        'px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                        i === activeMovement ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white',
                      ].join(' ')}
                    >
                      {m.movementName}
                    </button>
                  ))}
                </div>
              )}

              <SetsTable
                movement={active}
                movementIdx={activeMovement}
                prescription={activePrescription}
                onUpdate={updateSet}
                onAddSet={addSet}
                onRemoveSet={removeSet}
                onUnitChange={setMovementUnit}
              />
            </div>
          )}

          {/* Workout-level score (Metcons + MonoStructural) */}
          {mode === 'score' && (
            <ScoreFields
              workout={workout}
              kind={scoreKind}
              fields={scoreFields}
              onChange={setScoreFields}
            />
          )}

          {mode === 'notes-only' && (
            <p className="text-xs text-gray-400">
              This workout type doesn't have a structured score. Add notes below
              to record what you did.
            </p>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Notes <span className="normal-case font-normal">(optional)</span>
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="How'd it go?"
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="rounded-lg bg-red-950/50 border border-red-800/50 px-4 py-3 space-y-3">
              <p className="text-sm text-red-300">Delete this result? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-1.5 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 space-y-2">
          <button
            onClick={handleSubmit}
            disabled={submitting || alreadyLogged}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {submitting ? 'Saving…' : isEdit ? 'Update Result' : 'Save Result'}
          </button>
          {isEdit && !showDeleteConfirm && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2 rounded-lg text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
            >
              Delete result
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sets table ────────────────────────────────────────────────────────────────

function SetsTable({
  movement,
  movementIdx,
  prescription,
  onUpdate,
  onAddSet,
  onRemoveSet,
  onUnitChange,
}: {
  movement: MovementSection
  movementIdx: number
  prescription: WorkoutMovementWithPrescription | null
  onUpdate: (mIdx: number, sIdx: number, field: keyof SetRow, value: string) => void
  onAddSet: (mIdx: number) => void
  onRemoveSet: (mIdx: number, sIdx: number) => void
  onUnitChange: (mIdx: number, field: 'loadUnit' | 'distanceUnit', value: LoadUnit | DistanceUnit) => void
}) {
  // The columns to surface come from whichever fields the programmer
  // prescribed — anything they didn't prescribe is hidden by default. Members
  // can show extras via the "Add column" buttons below the table.
  const prescribed = useMemo(() => {
    if (!prescription) return new Set<keyof SetRow>(['reps', 'load'])
    const cols = new Set<keyof SetRow>()
    if (prescription.reps !== null)     cols.add('reps')
    if (prescription.load !== null)     cols.add('load')
    if (prescription.tempo !== null)    cols.add('tempo')
    if (prescription.distance !== null) cols.add('distance')
    if (prescription.calories !== null) cols.add('calories')
    if (prescription.seconds !== null)  cols.add('seconds')
    if (cols.size === 0) cols.add('reps').add('load')
    return cols
  }, [prescription])

  // Auto-show a column if the user has typed into any cell of it.
  const visible = useMemo(() => {
    const cols = new Set(prescribed)
    for (const s of movement.sets) {
      ;(['reps', 'load', 'tempo', 'distance', 'calories', 'seconds'] as const).forEach((c) => {
        if (s[c] !== '') cols.add(c)
      })
    }
    return cols
  }, [prescribed, movement.sets])

  const allColumns: { key: keyof SetRow; label: string; placeholder: string }[] = [
    { key: 'reps',     label: 'Reps',     placeholder: '5 or 1.1.1' },
    { key: 'load',     label: 'Load',     placeholder: '225' },
    { key: 'tempo',    label: 'Tempo',    placeholder: '3.1.1.0' },
    { key: 'distance', label: 'Distance', placeholder: '500' },
    { key: 'calories', label: 'Cals',     placeholder: '20' },
    { key: 'seconds',  label: 'Seconds',  placeholder: '60' },
  ]
  const showColumns = allColumns.filter((c) => visible.has(c.key))
  const hiddenColumns = allColumns.filter((c) => !visible.has(c.key))

  return (
    <div className="space-y-2">
      {/* Unit pickers — only render when load or distance is in play */}
      <div className="flex gap-3 text-xs text-gray-400">
        {visible.has('load') && (
          <label className="flex items-center gap-1.5">
            Load:
            <select
              aria-label={`Load unit for ${movement.movementName}`}
              value={movement.loadUnit}
              onChange={(e) => onUnitChange(movementIdx, 'loadUnit', e.target.value as LoadUnit)}
              className="bg-gray-800 text-white rounded px-1.5 py-0.5 border border-gray-700"
            >
              <option value="LB">lb</option>
              <option value="KG">kg</option>
            </select>
          </label>
        )}
        {visible.has('distance') && (
          <label className="flex items-center gap-1.5">
            Distance:
            <select
              aria-label={`Distance unit for ${movement.movementName}`}
              value={movement.distanceUnit}
              onChange={(e) => onUnitChange(movementIdx, 'distanceUnit', e.target.value as DistanceUnit)}
              className="bg-gray-800 text-white rounded px-1.5 py-0.5 border border-gray-700"
            >
              <option value="M">m</option>
              <option value="KM">km</option>
              <option value="MI">mi</option>
              <option value="FT">ft</option>
              <option value="YD">yd</option>
            </select>
          </label>
        )}
      </div>

      <table className="w-full text-sm" aria-label={`Sets for ${movement.movementName}`}>
        <thead>
          <tr className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
            <th className="w-10 text-left pb-1.5">Set</th>
            {showColumns.map((c) => (
              <th key={c.key} className="text-left pb-1.5">{c.label}</th>
            ))}
            <th className="w-7" aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {movement.sets.map((s, sIdx) => (
            <tr key={sIdx}>
              <td className="text-xs text-gray-500 pr-2 align-middle">{sIdx + 1}</td>
              {showColumns.map((c) => (
                <td key={c.key} className="pr-1.5 pb-1.5">
                  <input
                    type="text"
                    inputMode={c.key === 'reps' || c.key === 'tempo' ? 'text' : 'decimal'}
                    aria-label={`Set ${sIdx + 1} ${c.label}`}
                    value={s[c.key]}
                    onChange={(e) => onUpdate(movementIdx, sIdx, c.key, e.target.value)}
                    placeholder={c.placeholder}
                    className="w-full bg-gray-800 text-white text-sm rounded px-2 py-1.5 border border-gray-700 focus:outline-none focus:border-indigo-500"
                  />
                </td>
              ))}
              <td className="align-middle text-right pb-1.5">
                {movement.sets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveSet(movementIdx, sIdx)}
                    aria-label={`Remove set ${sIdx + 1}`}
                    className="-my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onAddSet(movementIdx)}
          className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-colors"
        >
          + Add set
        </button>
        {hiddenColumns.map((c) => (
          <button
            key={c.key}
            type="button"
            // Add-column is implicit: adding text to an unused cell on the
            // first row reveals the column. We surface a button per hidden
            // column to make discovery obvious.
            onClick={() => onUpdate(movementIdx, 0, c.key, c.placeholder.split(' ')[0])}
            className="px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-400 hover:text-white transition-colors"
          >
            + {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Score fields (Metcons + MonoStructural) ──────────────────────────────────

interface ScoreFieldState {
  rounds: string
  reps: string
  minutes: string
  seconds: string
  cappedOut: boolean
  distance: string
  distanceUnit: DistanceUnit
  calories: string
}

function initialScoreFields(workout: Workout, existing: WorkoutResult | undefined, kind: ScoreKind): ScoreFieldState {
  const score = (existing?.value as { score?: { kind?: string } & Record<string, unknown> } | undefined)?.score
  const totalSec = score?.kind === 'TIME' ? Number(score.seconds ?? 0) : 0
  const distUnit = score?.kind === 'DISTANCE' ? (score.unit as DistanceUnit | undefined) : undefined
  return {
    rounds:    score?.kind === 'ROUNDS_REPS' && score.rounds != null ? String(score.rounds) : '',
    reps:      score?.kind === 'ROUNDS_REPS' && score.reps   != null ? String(score.reps)   : '',
    minutes:   score?.kind === 'TIME' ? String(Math.floor(totalSec / 60)) : '',
    seconds:   score?.kind === 'TIME' ? String(totalSec % 60) : '',
    cappedOut: score?.kind === 'TIME' || score?.kind === 'ROUNDS_REPS' ? Boolean(score.cappedOut) : false,
    distance:  score?.kind === 'DISTANCE' && score.distance != null ? String(score.distance) : '',
    distanceUnit: distUnit ?? workout.workoutMovements[0]?.distanceUnit ?? 'M',
    calories:  score?.kind === 'CALORIES' && score.calories != null ? String(score.calories) : '',
    // mark `kind` so unit consumers don't lint it as unused
    ...(kind === 'TIME' ? {} : {}),
  }
}

function ScoreFields({
  workout,
  kind,
  fields,
  onChange,
}: {
  workout: Workout
  kind: ScoreKind
  fields: ScoreFieldState
  onChange: (next: ScoreFieldState) => void
}) {
  const update = <K extends keyof ScoreFieldState>(field: K, value: ScoreFieldState[K]) =>
    onChange({ ...fields, [field]: value })

  if (kind === 'ROUNDS_REPS') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Score</p>
        {workout.tracksRounds && (
          <div>
            <label htmlFor="lr-rounds" className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Rounds</label>
            <input id="lr-rounds" type="number" min="0" value={fields.rounds} onChange={(e) => update('rounds', e.target.value)} placeholder="0"
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
          </div>
        )}
        <div>
          <label htmlFor="lr-reps" className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Reps</label>
          <input id="lr-reps" type="number" min="0" value={fields.reps} onChange={(e) => update('reps', e.target.value)} placeholder="0"
            className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
        </div>
      </div>
    )
  }
  if (kind === 'TIME') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Time</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lr-min" className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Min</label>
            <input id="lr-min" type="number" min="0" value={fields.minutes} onChange={(e) => update('minutes', e.target.value)} placeholder="0"
              disabled={fields.cappedOut}
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40" />
          </div>
          <div>
            <label htmlFor="lr-sec" className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Sec</label>
            <input id="lr-sec" type="number" min="0" max="59" value={fields.seconds} onChange={(e) => update('seconds', e.target.value)} placeholder="0"
              disabled={fields.cappedOut}
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer min-h-7">
          <input type="checkbox" checked={fields.cappedOut} onChange={(e) => update('cappedOut', e.target.checked)} className="w-4 h-4 rounded accent-indigo-500" />
          <span className="text-sm text-gray-300">Time capped</span>
        </label>
      </div>
    )
  }
  if (kind === 'DISTANCE') {
    return (
      <div className="space-y-3">
        <label htmlFor="lr-distance" className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Distance</label>
        <div className="flex gap-2">
          <input id="lr-distance" type="number" min="0" value={fields.distance} onChange={(e) => update('distance', e.target.value)} placeholder="0"
            className="flex-1 bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
          <select aria-label="Distance unit" value={fields.distanceUnit} onChange={(e) => update('distanceUnit', e.target.value as DistanceUnit)}
            className="bg-gray-800 text-white rounded-md px-2 border border-gray-700">
            <option value="M">m</option>
            <option value="KM">km</option>
            <option value="MI">mi</option>
            <option value="FT">ft</option>
            <option value="YD">yd</option>
          </select>
        </div>
      </div>
    )
  }
  // CALORIES
  return (
    <div className="space-y-3">
      <label htmlFor="lr-cals" className="block text-xs font-medium text-gray-400 uppercase tracking-wide">Calories</label>
      <input id="lr-cals" type="number" min="0" value={fields.calories} onChange={(e) => update('calories', e.target.value)} placeholder="0"
        className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
    </div>
  )
}

// ─── Build helpers ────────────────────────────────────────────────────────────

type Result<T> = { ok: true } & T | { ok: false; error: string }

function buildScore(kind: ScoreKind, f: ScoreFieldState): Result<{ score: Record<string, unknown> }> {
  if (kind === 'ROUNDS_REPS') {
    const r = parseInt(f.rounds || '0', 10)
    const rp = parseInt(f.reps || '0', 10)
    if (!Number.isInteger(r) || r < 0) return { ok: false, error: 'Rounds must be a non-negative number.' }
    if (!Number.isInteger(rp) || rp < 0) return { ok: false, error: 'Reps must be a non-negative number.' }
    return { ok: true, score: { kind: 'ROUNDS_REPS', rounds: r, reps: rp, cappedOut: false } }
  }
  if (kind === 'TIME') {
    const m = parseInt(f.minutes || '0', 10)
    const s = parseInt(f.seconds || '0', 10)
    if (!Number.isInteger(m) || m < 0) return { ok: false, error: 'Minutes must be a non-negative number.' }
    if (!Number.isInteger(s) || s < 0 || s > 59) return { ok: false, error: 'Seconds must be 0–59.' }
    return { ok: true, score: { kind: 'TIME', seconds: m * 60 + s, cappedOut: f.cappedOut } }
  }
  if (kind === 'DISTANCE') {
    const d = parseFloat(f.distance)
    if (!isFinite(d) || d <= 0) return { ok: false, error: 'Enter a positive distance.' }
    return { ok: true, score: { kind: 'DISTANCE', distance: d, unit: f.distanceUnit } }
  }
  const c = parseInt(f.calories || '0', 10)
  if (!Number.isInteger(c) || c < 0) return { ok: false, error: 'Calories must be a non-negative number.' }
  return { ok: true, score: { kind: 'CALORIES', calories: c } }
}

function buildMovementResults(movements: MovementSection[]): Result<{
  results: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[]
}> {
  const out: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[] = []
  for (const m of movements) {
    const sets: Record<string, unknown>[] = []
    let hasLoad = false, hasDistance = false
    for (let i = 0; i < m.sets.length; i++) {
      const s = m.sets[i]
      const set: Record<string, unknown> = {}
      if (s.reps) {
        if (!REPS_REGEX.test(s.reps)) return { ok: false, error: `${m.movementName} set ${i + 1}: reps must be digits, e.g. "5" or cluster "1.1.1".` }
        set.reps = s.reps
      }
      if (s.load) {
        const v = parseFloat(s.load)
        if (!isFinite(v) || v <= 0) return { ok: false, error: `${m.movementName} set ${i + 1}: load must be positive.` }
        set.load = v; hasLoad = true
      }
      if (s.tempo) {
        if (!TEMPO_REGEX.test(s.tempo)) return { ok: false, error: `${m.movementName} set ${i + 1}: tempo must be four dot-separated values, e.g. "3.1.1.0".` }
        set.tempo = s.tempo
      }
      if (s.distance) {
        const v = parseFloat(s.distance)
        if (!isFinite(v) || v <= 0) return { ok: false, error: `${m.movementName} set ${i + 1}: distance must be positive.` }
        set.distance = v; hasDistance = true
      }
      if (s.calories) {
        const v = parseInt(s.calories, 10)
        if (!Number.isInteger(v) || v < 0) return { ok: false, error: `${m.movementName} set ${i + 1}: calories must be a non-negative integer.` }
        set.calories = v
      }
      if (s.seconds) {
        const v = parseInt(s.seconds, 10)
        if (!Number.isInteger(v) || v < 0) return { ok: false, error: `${m.movementName} set ${i + 1}: seconds must be a non-negative integer.` }
        set.seconds = v
      }
      if (Object.keys(set).length === 0) continue
      sets.push(set)
    }
    if (sets.length === 0) continue
    out.push({
      workoutMovementId: m.workoutMovementId,
      ...(hasLoad ? { loadUnit: m.loadUnit } : {}),
      ...(hasDistance ? { distanceUnit: m.distanceUnit } : {}),
      sets,
    })
  }
  return { ok: true, results: out }
}
