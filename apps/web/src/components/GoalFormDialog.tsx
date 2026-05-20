/**
 * Modal for creating a new goal. Three goal types (PR Target, Frequency,
 * Habit) share a single dialog shell; per-type inputs live in dedicated
 * sub-forms.
 *
 * Field shape mirrors `CreateGoalSchema` in `packages/types/src/goal.ts`.
 * Validation is intentionally light — the Zod schema is the source of
 * truth, and the server returns flattened error details we show inline
 * if the request fails.
 *
 * SMART hint: a banner appears whenever the target date is empty, copy
 * straight from #433.
 *
 * Note: this v1 is *create-only*. The detail page exposes title +
 * target-date edits via PATCH (UpdateGoalSchema covers exactly those
 * fields).
 */
import { useEffect, useMemo, useState } from 'react'
import type {
  GoalType,
  TargetPrType,
  CreateGoalInput,
  NamedWorkout,
} from '../lib/api'
import { api } from '../lib/api'
import { useMovements } from '../context/MovementsContext'
import Button from './ui/Button'

interface GoalFormDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

type Subject = 'movement' | 'namedWorkout'

export default function GoalFormDialog({ open, onClose, onCreated }: GoalFormDialogProps) {
  const [type, setType] = useState<GoalType>('PR_TARGET')
  const [title, setTitle] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PR Target fields
  const [subject, setSubject] = useState<Subject>('movement')
  const [movementId, setMovementId] = useState('')
  const [namedWorkoutId, setNamedWorkoutId] = useState('')
  const [targetPrType, setTargetPrType] = useState<TargetPrType>('LOAD')
  const [targetValue, setTargetValue] = useState('')
  const [targetLoadUnit, setTargetLoadUnit] = useState<'LB' | 'KG'>('LB')
  const [targetRepCount, setTargetRepCount] = useState('1')

  // Frequency fields
  const [perWeek, setPerWeek] = useState('3')
  const [weeks, setWeeks] = useState('4')

  const movements = useMovements()
  const [namedWorkouts, setNamedWorkouts] = useState<NamedWorkout[]>([])

  // Reset state every time the dialog opens so it never carries
  // stale input from the previous invocation.
  useEffect(() => {
    if (!open) return
    setType('PR_TARGET')
    setTitle('')
    setTargetDate('')
    setSubject('movement')
    setMovementId('')
    setNamedWorkoutId('')
    setTargetPrType('LOAD')
    setTargetValue('')
    setTargetLoadUnit('LB')
    setTargetRepCount('1')
    setPerWeek('3')
    setWeeks('4')
    setError(null)
    setSaving(false)
  }, [open])

  // Lazy-load named workouts the first time PR Target + named workout
  // is selected — most goals key off movement, no need to fetch up front.
  useEffect(() => {
    if (!open) return
    if (subject !== 'namedWorkout') return
    if (namedWorkouts.length > 0) return
    api.namedWorkouts.list().then(setNamedWorkouts).catch(() => {})
  }, [open, subject, namedWorkouts.length])

  // Escape closes — mirrors the rest of the app's modals/drawers.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const showSmartHint = open && !targetDate

  const showRepCount = type === 'PR_TARGET' && targetPrType === 'LOAD'

  const sortedMovements = useMemo(
    () => [...movements].sort((a, b) => a.name.localeCompare(b.name)),
    [movements],
  )

  function buildPayload(): CreateGoalInput | null {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title is required')
      return null
    }
    const targetDateIso = targetDate ? new Date(targetDate).toISOString() : undefined

    if (type === 'PR_TARGET') {
      if (subject === 'movement' && !movementId) {
        setError('Pick a movement (or switch to Named Workout)')
        return null
      }
      if (subject === 'namedWorkout' && !namedWorkoutId) {
        setError('Pick a named workout (or switch to Movement)')
        return null
      }
      const value = Number(targetValue)
      if (!Number.isFinite(value) || value <= 0) {
        setError('Target value must be a positive number')
        return null
      }
      const payload: CreateGoalInput = {
        type: 'PR_TARGET',
        title: trimmedTitle,
        targetDate: targetDateIso,
        targetPrType,
        targetValue: value,
        movementId: subject === 'movement' ? movementId : undefined,
        namedWorkoutId: subject === 'namedWorkout' ? namedWorkoutId : undefined,
        ...(targetPrType === 'LOAD'
          ? { targetLoadUnit, targetRepCount: Number(targetRepCount) || 1 }
          : {}),
      }
      return payload
    }
    if (type === 'FREQUENCY') {
      const p = Number(perWeek)
      const w = Number(weeks)
      if (!Number.isFinite(p) || p < 1 || p > 14) {
        setError('Workouts per week must be 1–14')
        return null
      }
      if (!Number.isFinite(w) || w < 1 || w > 52) {
        setError('Number of weeks must be 1–52')
        return null
      }
      return {
        type: 'FREQUENCY',
        title: trimmedTitle,
        targetDate: targetDateIso,
        frequencyPerWeek: p,
        frequencyWeeks: w,
      }
    }
    return { type: 'HABIT', title: trimmedTitle, targetDate: targetDateIso }
  }

  async function handleSubmit() {
    setError(null)
    const payload = buildPayload()
    if (!payload) return
    setSaving(true)
    try {
      await api.users.me.goals.create(payload)
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create goal')
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-form-title"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 id="goal-form-title" className="text-base font-semibold text-slate-950 dark:text-gray-100">
          New goal
        </h2>

        {/* Type picker */}
        <div className="space-y-1.5">
          <label htmlFor="goal-type" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
            Type
          </label>
          <select
            id="goal-type"
            value={type}
            onChange={(e) => setType(e.target.value as GoalType)}
            className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="PR_TARGET">PR Target — beat a PR on a movement or workout</option>
            <option value="FREQUENCY">Frequency — train X times per week</option>
            <option value="HABIT">Habit — a one-off accomplishment</option>
          </select>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label htmlFor="goal-title" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
            Title
          </label>
          <input
            id="goal-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === 'PR_TARGET' ? 'e.g. Hit a 315 lb back squat' :
              type === 'FREQUENCY' ? 'e.g. 4 workouts/wk for a month' :
              'e.g. Sign up for the Open'
            }
            className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* PR Target sub-form */}
        {type === 'PR_TARGET' && (
          <div className="space-y-3 border-l-2 border-slate-200 dark:border-gray-800 pl-3">
            <div className="space-y-1.5">
              <label htmlFor="goal-subject" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                Chase a PR on
              </label>
              <select
                id="goal-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value as Subject)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="movement">Movement</option>
                <option value="namedWorkout">Named workout</option>
              </select>
            </div>

            {subject === 'movement' ? (
              <div className="space-y-1.5">
                <label htmlFor="goal-movement" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                  Movement
                </label>
                <select
                  id="goal-movement"
                  value={movementId}
                  onChange={(e) => setMovementId(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a movement…</option>
                  {sortedMovements.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="goal-named" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                  Named workout
                </label>
                <select
                  id="goal-named"
                  value={namedWorkoutId}
                  onChange={(e) => setNamedWorkoutId(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a named workout…</option>
                  {namedWorkouts.map((nw) => (
                    <option key={nw.id} value={nw.id}>{nw.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="goal-pr-type" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                Track
              </label>
              <select
                id="goal-pr-type"
                value={targetPrType}
                onChange={(e) => setTargetPrType(e.target.value as TargetPrType)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="LOAD">Load (heaviest lifted)</option>
                <option value="MAX_REPS">Max reps</option>
                <option value="TIME">Time (faster is better)</option>
                <option value="DISTANCE">Distance</option>
                <option value="CALORIES">Calories</option>
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <label htmlFor="goal-target-value" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                  Target
                </label>
                <input
                  id="goal-target-value"
                  type="number"
                  min="0"
                  step="0.5"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {targetPrType === 'LOAD' && (
                <div className="w-24 space-y-1.5">
                  <label htmlFor="goal-load-unit" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                    Unit
                  </label>
                  <select
                    id="goal-load-unit"
                    value={targetLoadUnit}
                    onChange={(e) => setTargetLoadUnit(e.target.value as 'LB' | 'KG')}
                    className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="LB">lb</option>
                    <option value="KG">kg</option>
                  </select>
                </div>
              )}
            </div>

            {/*
             * Rep count only applies to LOAD goals (1RM, 3RM, 5RM, …).
             * Hide for every other PR type — there's no "reps" dimension
             * on a TIME or DISTANCE PR.
             */}
            {showRepCount && (
              <div className="space-y-1.5">
                <label htmlFor="goal-rep-count" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                  Rep count (1 = 1RM, 3 = 3RM, …)
                </label>
                <input
                  id="goal-rep-count"
                  type="number"
                  min="1"
                  step="1"
                  value={targetRepCount}
                  onChange={(e) => setTargetRepCount(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>
        )}

        {/* Frequency sub-form */}
        {type === 'FREQUENCY' && (
          <div className="grid grid-cols-2 gap-3 border-l-2 border-slate-200 dark:border-gray-800 pl-3">
            <div className="space-y-1.5">
              <label htmlFor="goal-per-week" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                Workouts / week
              </label>
              <input
                id="goal-per-week"
                type="number"
                min="1"
                max="14"
                value={perWeek}
                onChange={(e) => setPerWeek(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="goal-weeks" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
                For how many weeks
              </label>
              <input
                id="goal-weeks"
                type="number"
                min="1"
                max="52"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* Habit sub-form */}
        {type === 'HABIT' && (
          <p className="text-xs text-slate-500 dark:text-gray-400 border-l-2 border-slate-200 dark:border-gray-800 pl-3">
            Check-ins coming in v2 — for now, mark the goal complete when you finish it.
          </p>
        )}

        {/* Target date */}
        <div className="space-y-1.5">
          <label htmlFor="goal-target-date" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">
            Target date (optional)
          </label>
          <input
            id="goal-target-date"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {showSmartHint && (
          <div
            role="note"
            className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
          >
            Goals are easier to achieve when they're time-bound. Consider adding a target date — it's
            the T in SMART (Specific, Measurable, Achievable, Relevant, Time-bound).
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-700 dark:text-rose-400" role="alert">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving} className="flex-[2]">
            {saving ? 'Saving…' : 'Create goal'}
          </Button>
        </div>
      </div>
    </div>
  )
}
