import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { api, TYPE_ABBR, type Workout, type WorkoutCategory, type WorkoutResult, type WorkoutLevel, type WorkoutGender } from '../lib/api.ts'
import LogResultDrawer from '../components/LogResultDrawer.tsx'

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girl WOD',
  HERO_WOD: 'Hero WOD',
  OPEN_WOD: 'Open WOD',
  GAMES_WOD: 'Games WOD',
  BENCHMARK: 'Benchmark',
}

type LevelFilter = WorkoutLevel | 'ALL'
type GenderFilter = WorkoutGender | 'ALL'

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

const LEVEL_FILTERS: LevelFilter[] = ['ALL', 'RX_PLUS', 'RX', 'SCALED', 'MODIFIED']

const GENDER_FILTERS: { value: GenderFilter; label: string }[] = [
  { value: 'ALL',    label: 'Open' },
  { value: 'MALE',   label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
]

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatResultValue(result: WorkoutResult): string {
  const v = result.value
  const type = result.workout.type

  if (type === 'AMRAP') {
    const rounds = v.rounds as number
    const reps = v.reps as number
    return `${rounds} rounds + ${reps} reps`
  }

  if (type === 'FOR_TIME') {
    if (v.cappedOut) return 'CAPPED'
    return formatSeconds(v.seconds as number)
  }

  return '—'
}

export default function WodDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const fromHistory = (location.state as { from?: string } | null)?.from === 'history'

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [results, setResults] = useState<WorkoutResult[]>([])
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('ALL')
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLogDrawer, setShowLogDrawer] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    Promise.all([api.workouts.get(id), api.results.leaderboard(id)])
      .then(([w, r]) => {
        setWorkout(w)
        setResults(r)
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error || !workout) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-400">{error ?? 'Workout not found.'}</p>
        <button
          onClick={() => navigate('/feed')}
          className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Feed
        </button>
      </div>
    )
  }

  const scheduledDate = new Date(workout.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  const myResult = results.find((r) => r.userId === user?.id)

  const filteredResults = results
    .filter((r) => levelFilter === 'ALL' || r.level === levelFilter)
    .filter((r) => genderFilter === 'ALL' || r.workoutGender === genderFilter)

  return (
    <>
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate(fromHistory ? '/history' : '/feed')}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        {fromHistory ? '← Back to History' : '← Back to Feed'}
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="w-8 h-8 flex items-center justify-center rounded bg-gray-800 text-sm font-bold text-gray-300">
            {TYPE_ABBR[workout.type]}
          </span>
          <h1 className="text-2xl font-bold">{workout.title}</h1>
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

      {/* Description */}
      {workout.description && (
        <div className="bg-gray-900 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-300 whitespace-pre-wrap">{workout.description}</p>
        </div>
      )}

      {/* Movements */}
      {workout.movements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workout.movements.map((m, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {m}
            </span>
          ))}
        </div>
      )}

      {/* Log Result CTA */}
      {myResult ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your Result</span>
          <span className="text-sm font-medium text-white">{formatResultValue(myResult)}</span>
          <span className="text-xs text-gray-500 ml-auto">{LEVEL_LABELS[myResult.level]}</span>
        </div>
      ) : (
        <button
          onClick={() => setShowLogDrawer(true)}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          Log Result
        </button>
      )}

      {/* Results table */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Results</h2>
          <hr className="flex-1 border-gray-800" />
        </div>

        {/* Level filter chips */}
        <div className="flex flex-wrap gap-2 mb-2">
          {LEVEL_FILTERS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                levelFilter === lvl
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
              ].join(' ')}
            >
              {lvl === 'ALL' ? 'All' : LEVEL_LABELS[lvl as WorkoutLevel]}
            </button>
          ))}
        </div>

        {/* Gender filter chips */}
        <div className="flex gap-2 mb-4">
          {GENDER_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setGenderFilter(value)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                genderFilter === value
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredResults.length === 0 ? (
          <p className="text-sm text-gray-500">No results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-500 w-10">#</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-500">Athlete</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-500">Level</th>
                  <th className="pb-2 text-xs font-medium text-gray-500">Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, index) => {
                  const isMe = result.userId === user?.id
                  return (
                    <tr
                      key={result.id}
                      className={[
                        'border-b border-gray-900',
                        isMe ? 'text-indigo-300' : 'text-gray-300',
                      ].join(' ')}
                    >
                      <td className="py-2.5 pr-4 text-gray-500">{index + 1}</td>
                      <td className="py-2.5 pr-4 font-medium">
                        {result.user.name ?? 'Unknown'}
                        {isMe && <span className="ml-1.5 text-xs text-indigo-400">(you)</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-400">{LEVEL_LABELS[result.level]}</td>
                      <td className="py-2.5 font-mono">{formatResultValue(result)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {showLogDrawer && workout && (
      <LogResultDrawer
        workout={workout}
        onClose={() => setShowLogDrawer(false)}
        onLogged={() => {
          setShowLogDrawer(false)
          api.results.leaderboard(id!).then(setResults).catch(() => {})
        }}
      />
    )}
    </>
  )
}
