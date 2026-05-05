import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { api, type Workout, type WorkoutCategory, type WorkoutResult, type WorkoutLevel } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import MarkdownDescription from '../components/MarkdownDescription.tsx'
import Avatar from '../components/Avatar.tsx'
import { formatResultValue as formatValue } from '../lib/formatResult.ts'

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girl WOD',
  HERO_WOD: 'Hero WOD',
  OPEN_WOD: 'Open WOD',
  GAMES_WOD: 'Games WOD',
  BENCHMARK: 'Benchmark',
}

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

const WORKOUT_GENDER_LABELS: Record<'MALE' | 'FEMALE' | 'OPEN', string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OPEN: 'Open',
}

function formatResultValue(result: WorkoutResult): string {
  return formatValue(result.value)
}

interface SetEntry {
  reps?: string
  load?: number
  tempo?: string
  distance?: number
  calories?: number
  seconds?: number
}

interface MovementResultEntry {
  workoutMovementId?: string
  loadUnit?: string
  distanceUnit?: string
  sets?: SetEntry[]
}

function formatSeconds(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Compose one set into a "5 × 225 lb · tempo 3.1.1.0" line. Empty fields are
// dropped so the row only shows what the member actually logged.
function describeSet(set: SetEntry, loadUnit?: string, distanceUnit?: string): string {
  const parts: string[] = []
  const repsLabel = set.reps ?? (set.load !== undefined ? '?' : null)
  if (set.load !== undefined) {
    const unit = loadUnit ? ` ${loadUnit.toLowerCase()}` : ''
    parts.push(`${repsLabel ?? '?'} × ${set.load}${unit}`)
  } else if (set.reps) {
    parts.push(`${set.reps} reps`)
  }
  if (set.distance !== undefined) {
    const unit = distanceUnit ? ` ${distanceUnit.toLowerCase()}` : ''
    parts.push(`${set.distance}${unit}`)
  }
  if (set.calories !== undefined) parts.push(`${set.calories} cal`)
  if (set.seconds !== undefined) parts.push(formatSeconds(set.seconds))
  if (set.tempo) parts.push(`tempo ${set.tempo}`)
  return parts.join(' · ') || '—'
}

export default function WodResultDetail() {
  const { id, resultId } = useParams<{ id: string; resultId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const locationState = location.state as { from?: string; originWorkoutId?: string } | null
  const fromMovementHistory = locationState?.from === 'movement-history'
  const originWorkoutId = locationState?.originWorkoutId

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [result, setResult] = useState<WorkoutResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !resultId) return
    setLoading(true)
    setError(null)
    Promise.all([api.workouts.get(id), api.results.leaderboard(id)])
      .then(([w, r]) => {
        setWorkout(w)
        const found = r.find((x) => x.id === resultId)
        setResult(found ?? null)
        if (!found) setError('Result not found.')
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id, resultId])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error || !workout || !result) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-400">{error ?? 'Result not found.'}</p>
        <button
          onClick={() =>
            fromMovementHistory && originWorkoutId
              ? navigate(`/workouts/${originWorkoutId}`)
              : navigate(id ? `/workouts/${id}` : '/feed')
          }
          className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to WOD
        </button>
      </div>
    )
  }

  const isMe = result.userId === user?.id
  const ownerName = result.user.name ?? 'Unknown athlete'
  const titleText = isMe ? 'Your Result' : `${ownerName}'s Result`

  const movementResults = ((result.value as { movementResults?: MovementResultEntry[] } | null)?.movementResults ?? [])
    .filter((mr) => (mr.sets?.length ?? 0) > 0)
  const movementNameById = new Map(
    workout.workoutMovements.map((wm) => [wm.movement.id, wm.movement.name]),
  )

  const scheduledDate = new Date(workout.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={() =>
          fromMovementHistory && originWorkoutId
            ? navigate(`/workouts/${originWorkoutId}`)
            : navigate(`/workouts/${workout.id}`)
        }
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        ← Back to WOD
      </button>

      {/* Title — avatar + whose result */}
      <div className="flex items-center gap-3">
        <Avatar
          avatarUrl={result.user.avatarUrl}
          firstName={result.user.firstName}
          lastName={result.user.lastName}
          email={result.user.email}
          size="md"
        />
        <h1 className="text-2xl font-bold">{titleText}</h1>
      </div>

      {/* Workout context */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold ${WORKOUT_TYPE_STYLES[workout.type].bg} ${WORKOUT_TYPE_STYLES[workout.type].tint}`}>
            {WORKOUT_TYPE_STYLES[workout.type].abbr}
          </span>
          <h2 className="text-xl font-semibold">{workout.title}</h2>
          {workout.namedWorkout && (
            <span className="flex items-center gap-1.5 ml-1">
              <span className="text-sm text-indigo-400">● {workout.namedWorkout.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-700/40">
                {CATEGORY_LABELS[workout.namedWorkout.category]}
              </span>
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 ml-11">{scheduledDate}</p>
      </div>

      {workout.description && (
        <div className="bg-gray-900 rounded-lg px-4 py-3">
          <MarkdownDescription source={workout.description} />
        </div>
      )}

      {(workout.workoutMovements?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workout.workoutMovements?.map((wm) => (
            <span key={wm.movement.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {wm.movement.name}
            </span>
          ))}
        </div>
      )}

      {/* Result block */}
      <div className="px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Result</span>
          <span className="text-base font-medium text-white font-mono">{formatResultValue(result)}</span>
          <span className="text-xs text-gray-400">{LEVEL_LABELS[result.level]}</span>
          <span className="text-xs text-gray-500">{WORKOUT_GENDER_LABELS[result.workoutGender]}</span>
        </div>
        {movementResults.length > 0 && (
          <div className="space-y-3 pt-1">
            {movementResults.map((mr, mIdx) => {
              const name = (mr.workoutMovementId && movementNameById.get(mr.workoutMovementId)) || 'Movement'
              return (
                <div key={mr.workoutMovementId ?? mIdx}>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{name}</p>
                  <ol className="space-y-1">
                    {(mr.sets ?? []).map((set, sIdx) => (
                      <li
                        key={sIdx}
                        className="flex items-baseline gap-3 text-sm text-gray-200"
                      >
                        <span className="text-xs text-gray-400 font-mono w-12 shrink-0">Set {sIdx + 1}</span>
                        <span className="font-mono">{describeSet(set, mr.loadUnit, mr.distanceUnit)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )
            })}
          </div>
        )}
        {result.notes ? (
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.notes}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No notes for this result.</p>
        )}
      </div>
    </div>
  )
}
