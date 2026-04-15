import { useState } from 'react'
import { useAuth, type IdentifiedGender } from '../context/AuthContext.tsx'
import { apiFetch, TYPE_ABBR, type Workout, type WorkoutGender, type WorkoutLevel } from '../lib/api.ts'

interface LogResultDrawerProps {
  workout: Workout
  onClose: () => void
  onLogged: () => void
}

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX',      label: 'RX' },
  { value: 'SCALED',  label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const SUPPORTED_TYPES = new Set(['AMRAP', 'FOR_TIME'])

function deriveWorkoutGender(g: IdentifiedGender): WorkoutGender {
  if (g === 'MAN') return 'MALE'
  if (g === 'WOMAN') return 'FEMALE'
  return 'OPEN'
}

export default function LogResultDrawer({ workout, onClose, onLogged }: LogResultDrawerProps) {
  const { user } = useAuth()
  const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)

  const [level, setLevel] = useState<WorkoutLevel>('RX')

  // AMRAP fields
  const [rounds, setRounds] = useState('')
  const [reps, setReps] = useState('')

  // FOR_TIME fields
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [cappedOut, setCappedOut] = useState(false)

  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSupported = SUPPORTED_TYPES.has(workout.type)

  async function handleSubmit() {
    setError(null)
    setAlreadyLogged(false)

    let value: Record<string, unknown>
    if (workout.type === 'AMRAP') {
      const r = parseInt(rounds, 10)
      const rp = parseInt(reps, 10)
      if (isNaN(r) || r < 0) { setError('Rounds must be a non-negative number.'); return }
      if (isNaN(rp) || rp < 0) { setError('Reps must be a non-negative number.'); return }
      value = { type: 'AMRAP', rounds: r, reps: rp }
    } else {
      // FOR_TIME
      const m = parseInt(minutes || '0', 10)
      const s = parseInt(seconds || '0', 10)
      if (isNaN(m) || m < 0) { setError('Minutes must be a non-negative number.'); return }
      if (isNaN(s) || s < 0 || s > 59) { setError('Seconds must be 0–59.'); return }
      value = { type: 'FOR_TIME', seconds: m * 60 + s, cappedOut }
    }

    setSubmitting(true)
    try {
      const res = await apiFetch(`/api/workouts/${workout.id}/results`, {
        method: 'POST',
        body: JSON.stringify({ level, workoutGender, value, notes: notes.trim() || undefined }),
      })
      if (res.status === 409) {
        setAlreadyLogged(true)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to log result.')
        return
      }
      onLogged()
    } catch {
      setError('Failed to log result.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-gray-900 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 flex items-center justify-center rounded bg-gray-800 text-xs font-bold text-gray-300">
              {TYPE_ABBR[workout.type]}
            </span>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Log Result</p>
              <p className="text-xs text-gray-500 leading-tight truncate max-w-[180px]">{workout.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Error / already-logged banner */}
          {alreadyLogged && (
            <p className="text-sm text-red-400">You've already logged this workout.</p>
          )}
          {error && !alreadyLogged && (
            <p className="text-sm text-red-400">{error}</p>
          )}

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
                    level === v
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
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
                <input
                  type="number"
                  min="0"
                  value={rounds}
                  onChange={(e) => setRounds(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Reps</label>
                <input
                  type="number"
                  min="0"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder="0"
                  className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ) : (
            /* FOR_TIME */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Min</label>
                  <input
                    type="number"
                    min="0"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="0"
                    disabled={cappedOut}
                    className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Sec</label>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                    placeholder="0"
                    disabled={cappedOut}
                    className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cappedOut}
                  onChange={(e) => setCappedOut(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500"
                />
                <span className="text-sm text-gray-300">Time capped</span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Notes <span className="normal-case font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="How'd it go?"
              className="w-full bg-gray-800 text-white text-sm rounded-md px-3 py-2 border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800">
          <button
            onClick={handleSubmit}
            disabled={submitting || !isSupported || alreadyLogged}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {submitting ? 'Saving…' : 'Save Result'}
          </button>
        </div>
      </div>
    </div>
  )
}
