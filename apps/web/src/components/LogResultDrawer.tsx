import { useState } from 'react'
import { useAuth, type IdentifiedGender } from '../context/AuthContext.tsx'
import { api, apiFetch, TYPE_ABBR, type Workout, type WorkoutGender, type WorkoutLevel, type WorkoutResult } from '../lib/api.ts'

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

const SUPPORTED_TYPES = new Set(['AMRAP', 'FOR_TIME'])

function deriveWorkoutGender(g: IdentifiedGender): WorkoutGender {
  if (g === 'MALE' || g === 'FEMALE') return g
  return 'OPEN'
}

function initialAmrap(r?: WorkoutResult) {
  if (!r) return { rounds: '', reps: '' }
  const v = r.value as { rounds?: number; reps?: number }
  return { rounds: String(v.rounds ?? ''), reps: String(v.reps ?? '') }
}

function initialForTime(r?: WorkoutResult) {
  if (!r) return { minutes: '', seconds: '', cappedOut: false }
  const v = r.value as { seconds?: number; cappedOut?: boolean }
  const totalSec = v.seconds ?? 0
  return {
    minutes: String(Math.floor(totalSec / 60)),
    seconds: String(totalSec % 60),
    cappedOut: v.cappedOut ?? false,
  }
}

export default function LogResultDrawer({ workout, existingResult, onClose, onSaved, onDeleted }: LogResultDrawerProps) {
  const { user } = useAuth()
  const isEdit = !!existingResult
  const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)

  const [level, setLevel] = useState<WorkoutLevel>(existingResult?.level ?? 'RX')

  const amrapInit = initialAmrap(existingResult)
  const [rounds, setRounds] = useState(amrapInit.rounds)
  const [reps, setReps] = useState(amrapInit.reps)

  const ftInit = initialForTime(existingResult)
  const [minutes, setMinutes] = useState(ftInit.minutes)
  const [seconds, setSeconds] = useState(ftInit.seconds)
  const [cappedOut, setCappedOut] = useState(ftInit.cappedOut)

  const [notes, setNotes] = useState(existingResult?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSupported = SUPPORTED_TYPES.has(workout.type)

  function buildValue(): Record<string, unknown> | null {
    if (workout.type === 'AMRAP') {
      const r = parseInt(rounds, 10)
      const rp = parseInt(reps, 10)
      if (isNaN(r) || r < 0) { setError('Rounds must be a non-negative number.'); return null }
      if (isNaN(rp) || rp < 0) { setError('Reps must be a non-negative number.'); return null }
      return { type: 'AMRAP', rounds: r, reps: rp }
    }
    const m = parseInt(minutes || '0', 10)
    const s = parseInt(seconds || '0', 10)
    if (isNaN(m) || m < 0) { setError('Minutes must be a non-negative number.'); return null }
    if (isNaN(s) || s < 0 || s > 59) { setError('Seconds must be 0–59.'); return null }
    return { type: 'FOR_TIME', seconds: m * 60 + s, cappedOut }
  }

  async function handleSubmit() {
    setError(null)
    setAlreadyLogged(false)
    const value = buildValue()
    if (!value) return

    setSubmitting(true)
    try {
      if (isEdit) {
        await api.results.update(existingResult.id, {
          level,
          value,
          notes: notes.trim() || null,
        })
        onSaved()
      } else {
        const res = await apiFetch(`/api/workouts/${workout.id}/results`, {
          method: 'POST',
          body: JSON.stringify({ level, workoutGender, value, notes: notes.trim() || undefined }),
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-gray-900 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 text-xs font-bold text-gray-300">
              {TYPE_ABBR[workout.type]}
            </span>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">
                {isEdit ? 'Edit Result' : 'Log Result'}
              </p>
              <p className="text-xs text-gray-400 leading-tight truncate max-w-[180px]">{workout.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-colors" aria-label="Close">×</button>
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

          {/* Type-specific fields */}
          {!isSupported ? (
            <p className="text-sm text-yellow-400">Result logging is not yet supported for this workout type.</p>
          ) : workout.type === 'AMRAP' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Rounds</label>
                <input type="number" min="0" value={rounds} onChange={(e) => setRounds(e.target.value)} placeholder="0"
                  className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Reps</label>
                <input type="number" min="0" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="0"
                  className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Min</label>
                  <input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="0"
                    disabled={cappedOut}
                    className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Sec</label>
                  <input type="number" min="0" max="59" value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="0"
                    disabled={cappedOut}
                    className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer min-h-7">
                <input type="checkbox" checked={cappedOut} onChange={(e) => setCappedOut(e.target.checked)} className="w-4 h-4 rounded accent-indigo-500" />
                <span className="text-sm text-gray-300">Time capped</span>
              </label>
            </div>
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
            disabled={submitting || !isSupported || alreadyLogged}
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
