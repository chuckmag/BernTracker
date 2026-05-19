import { useState } from 'react'
import {
  api,
  type BenchmarkResult,
  type BenchmarkResultInput,
  type LoadUnit,
  type NamedWorkout,
  type WorkoutGender,
  type WorkoutLevel,
  type WorkoutType,
} from '../lib/api.ts'
import Button from './ui/Button.tsx'

type ScoreMode = 'TIME' | 'ROUNDS_REPS' | 'LOAD' | 'REPS'

const STRENGTH_TYPES: WorkoutType[] = [
  'STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT',
]
const AMRAP_TYPES: WorkoutType[] = [
  'AMRAP', 'EMOM', 'INTERVALS', 'TABATA', 'DEATH_BY', 'LADDER',
]

function scoreModeFor(namedWorkout: NamedWorkout): ScoreMode {
  const type = namedWorkout.templateWorkout?.type
  if (!type) return 'TIME'
  if (AMRAP_TYPES.includes(type)) return 'ROUNDS_REPS'
  if (STRENGTH_TYPES.includes(type)) return 'LOAD'
  return 'TIME'
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX', label: 'RX' },
  { value: 'SCALED', label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const GENDERS: { value: WorkoutGender; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
]

const LABEL_CLS = 'block text-xs font-medium text-slate-600 dark:text-gray-400 mb-1'
const INPUT_CLS =
  'w-full rounded-lg border border-slate-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950'
const NUM_INPUT_CLS = INPUT_CLS + ' [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'

interface Props {
  namedWorkout: NamedWorkout
  onClose: () => void
  onSaved: (result: BenchmarkResult) => void
}

export default function AddBenchmarkResultModal({ namedWorkout, onClose, onSaved }: Props) {
  const scoreMode = scoreModeFor(namedWorkout)

  const [dateStr, setDateStr] = useState(todayStr())
  const [mins, setMins] = useState('')
  const [secs, setSecs] = useState('')
  const [rounds, setRounds] = useState('')
  const [reps, setReps] = useState('')
  const [load, setLoad] = useState('')
  const [loadUnit, setLoadUnit] = useState<LoadUnit>('LB')
  const [level, setLevel] = useState<WorkoutLevel>('RX')
  const [gender, setGender] = useState<WorkoutGender>('OPEN')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function buildInput(): BenchmarkResultInput {
    const achievedAt = new Date(`${dateStr}T12:00:00.000Z`).toISOString()
    let score: BenchmarkResultInput['value']['score']

    if (scoreMode === 'TIME') {
      score = { kind: 'TIME', seconds: (Number(mins) || 0) * 60 + (Number(secs) || 0), cappedOut: false }
    } else if (scoreMode === 'ROUNDS_REPS') {
      score = { kind: 'ROUNDS_REPS', rounds: Number(rounds) || 0, reps: Number(reps) || 0, cappedOut: false }
    } else if (scoreMode === 'LOAD') {
      score = { kind: 'LOAD', load: Number(load) || 0, unit: loadUnit }
    } else {
      score = { kind: 'REPS', reps: Number(reps) || 0 }
    }

    return {
      achievedAt,
      level,
      workoutGender: gender,
      value: { score, movementResults: [] },
      notes: notes.trim() || undefined,
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await api.me.benchmarks.logResult(namedWorkout.id, buildInput())
      onSaved(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save result')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-result-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between">
          <h2 id="add-result-title" className="text-sm font-semibold text-slate-950 dark:text-white">
            Add Result — {namedWorkout.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded text-slate-400 dark:text-gray-500 hover:text-slate-950 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Date */}
          <div>
            <label htmlFor="result-date" className={LABEL_CLS}>Date</label>
            <input
              id="result-date"
              type="date"
              value={dateStr}
              max={todayStr()}
              onChange={(e) => setDateStr(e.target.value)}
              required
              className={INPUT_CLS}
            />
          </div>

          {/* Score */}
          {scoreMode === 'TIME' && (
            <div>
              <span className={LABEL_CLS}>Time</span>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    id="result-mins"
                    aria-label="Minutes"
                    placeholder="0"
                    min="0"
                    value={mins}
                    onChange={(e) => setMins(e.target.value)}
                    className={NUM_INPUT_CLS}
                  />
                </div>
                <span className="text-slate-500 dark:text-gray-400 font-medium">:</span>
                <div className="flex-1">
                  <input
                    type="number"
                    id="result-secs"
                    aria-label="Seconds"
                    placeholder="0"
                    min="0"
                    max="59"
                    value={secs}
                    onChange={(e) => setSecs(e.target.value)}
                    className={NUM_INPUT_CLS}
                  />
                </div>
                <span className="text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">min : sec</span>
              </div>
            </div>
          )}

          {scoreMode === 'ROUNDS_REPS' && (
            <div>
              <span className={LABEL_CLS}>Score</span>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    aria-label="Rounds"
                    placeholder="0"
                    min="0"
                    value={rounds}
                    onChange={(e) => setRounds(e.target.value)}
                    className={NUM_INPUT_CLS}
                  />
                </div>
                <span className="text-slate-500 dark:text-gray-400">+</span>
                <div className="flex-1">
                  <input
                    type="number"
                    aria-label="Reps"
                    placeholder="0"
                    min="0"
                    value={reps}
                    onChange={(e) => setReps(e.target.value)}
                    className={NUM_INPUT_CLS}
                  />
                </div>
                <span className="text-xs text-slate-400 dark:text-gray-500 whitespace-nowrap">rnds + reps</span>
              </div>
            </div>
          )}

          {scoreMode === 'LOAD' && (
            <div>
              <label htmlFor="result-load" className={LABEL_CLS}>Load</label>
              <div className="flex gap-2">
                <input
                  id="result-load"
                  type="number"
                  placeholder="0"
                  min="0"
                  value={load}
                  onChange={(e) => setLoad(e.target.value)}
                  className={`${NUM_INPUT_CLS} flex-1`}
                />
                <select
                  aria-label="Load unit"
                  value={loadUnit}
                  onChange={(e) => setLoadUnit(e.target.value as LoadUnit)}
                  className={`${INPUT_CLS} w-20`}
                >
                  <option value="LB">lb</option>
                  <option value="KG">kg</option>
                </select>
              </div>
            </div>
          )}

          {scoreMode === 'REPS' && (
            <div>
              <label htmlFor="result-reps" className={LABEL_CLS}>Reps</label>
              <input
                id="result-reps"
                type="number"
                placeholder="0"
                min="0"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className={NUM_INPUT_CLS}
              />
            </div>
          )}

          {/* Level */}
          <div>
            <label htmlFor="result-level" className={LABEL_CLS}>Level</label>
            <select
              id="result-level"
              value={level}
              onChange={(e) => setLevel(e.target.value as WorkoutLevel)}
              className={INPUT_CLS}
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Gender */}
          <div>
            <label htmlFor="result-gender" className={LABEL_CLS}>Leaderboard division</label>
            <select
              id="result-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as WorkoutGender)}
              className={INPUT_CLS}
            >
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="result-notes" className={LABEL_CLS}>Notes (optional)</label>
            <textarea
              id="result-notes"
              rows={2}
              placeholder="Scaling, strategy, how it felt…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          {error && <p className="text-sm text-rose-500">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting} className="flex-1">
              {submitting ? 'Saving…' : 'Save Result'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
