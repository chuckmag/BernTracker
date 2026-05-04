import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { useGym } from '../context/GymContext.tsx'
import { api, type Workout, type WorkoutCategory, type WorkoutResult, type WorkoutLevel, type WorkoutGender } from '../lib/api.ts'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import LogResultDrawer from '../components/LogResultDrawer.tsx'
import WorkoutMovementHistory from '../components/WorkoutMovementHistory.tsx'
import MarkdownDescription from '../components/MarkdownDescription.tsx'
import Avatar from '../components/Avatar.tsx'
import Button from '../components/ui/Button.tsx'
import SegmentedControl from '../components/ui/SegmentedControl.tsx'
import { formatResultValue as formatValue } from '../lib/formatResult.ts'
import { AGE_DIVISIONS, getAgeDivision, type AgeDivision } from '@wodalytics/types'

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girl WOD',
  HERO_WOD: 'Hero WOD',
  OPEN_WOD: 'Open WOD',
  GAMES_WOD: 'Games WOD',
  BENCHMARK: 'Benchmark',
}

type GenderFilter = WorkoutGender | 'ALL'
type DivisionFilter = AgeDivision | 'ALL'

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

// Difficulty rank used by the graded level filter and the result ordering.
// Higher rank = harder. Selecting level X shows results with rank ≤ X.
const LEVEL_RANK: Record<WorkoutLevel, number> = {
  MODIFIED: 0,
  SCALED:   1,
  RX:       2,
  RX_PLUS:  3,
}

const LEVEL_OPTIONS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS',  label: 'RX+' },
  { value: 'RX',       label: 'RX' },
  { value: 'SCALED',   label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: 'ALL',    label: 'Open' },
  { value: 'MALE',   label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
]

function formatResultValue(result: WorkoutResult, tracksRounds?: boolean): string {
  return formatValue(result.value, { tracksRounds })
}

// Derives the crossfit.com permalink from an externalSourceId like
// "crossfit-mainsite:w20260425". Returns null for user-authored workouts.
function crossfitSourceUrl(externalSourceId: string | null): string | null {
  if (!externalSourceId?.startsWith('crossfit-mainsite:w')) return null
  const yyyymmdd = externalSourceId.replace('crossfit-mainsite:w', '')
  const yymmdd = yyyymmdd.slice(2)
  return `https://www.crossfit.com/workout/${yymmdd}`
}

export default function WodDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { gymRole } = useGym()
  const locationState = location.state as { from?: string; originWorkoutId?: string } | null
  const fromHistory = locationState?.from === 'history'
  // When the user arrives via a past-result link from the movement history
  // section, hide Your History to prevent infinite result → history → result nesting.
  const fromMovementHistory = locationState?.from === 'movement-history'

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [results, setResults] = useState<WorkoutResult[]>([])
  const [levelFilter, setLevelFilter] = useState<WorkoutLevel>('RX')
  const [showAllLevels, setShowAllLevels] = useState(false)
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL')
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('ALL')
  const [showAllDivisions, setShowAllDivisions] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLogDrawer, setShowLogDrawer] = useState(false)

  // Tracks which workout id has had the auto-detect default applied.
  // The auto-detect snaps levelFilter to the viewer's own logged level on
  // first leaderboard load (per workout). After it fires once, manual
  // segment changes — and re-fetches triggered by logging a result — must
  // not overwrite the user's selection.
  const autoDetectAppliedRef = useRef<string | null>(null)

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

  useEffect(() => {
    if (loading) return
    if (autoDetectAppliedRef.current === id) return
    autoDetectAppliedRef.current = id ?? null
    if (!user) return

    const my = results.find((r) => r.userId === user.id)
    if (my) setLevelFilter(my.level)

    // Auto-detect the viewer's age division from their birthday and the
    // workout's scheduled date. Mirrors the level auto-detect pattern above.
    if (workout && user.birthday) {
      const div = getAgeDivision(user.birthday, workout.scheduledAt)
      if (div) {
        setDivisionFilter(div)
        setShowAllDivisions(false)
      }
    }
  }, [id, loading, results, user, workout])

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
    timeZone: 'UTC',
  })

  const myResult = results.find((r) => r.userId === user?.id)
  const cfUrl = crossfitSourceUrl(workout.externalSourceId)

  // Graded inclusion: selecting level X shows X-and-easier (lower-rank) results.
  // Sort is stable, so within each level the API's performance ordering is preserved.
  const filteredResults = results
    .filter((r) => showAllLevels || LEVEL_RANK[r.level] <= LEVEL_RANK[levelFilter])
    .filter((r) => genderFilter === 'ALL' || r.workoutGender === genderFilter)
    .filter((r) => {
      if (showAllDivisions) return true
      return getAgeDivision(r.user.birthday, workout.scheduledAt) === divisionFilter
    })
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])

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
          <span className={`w-8 h-8 flex items-center justify-center rounded text-sm font-bold ${WORKOUT_TYPE_STYLES[workout.type].bg} ${WORKOUT_TYPE_STYLES[workout.type].tint}`}>
            {WORKOUT_TYPE_STYLES[workout.type].abbr}
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

      {/*
        Coach notes — programmer-authored stimulus / teaching points (#184).
        Placed ABOVE the description so the staff framing reads first when
        they're skimming a workout 5 min before class. Members see the same
        ordering, but with the section collapsed by default so the prescription
        stays the focal point.

        Default-open is role-driven (per the cross-app contract in #184):
          MEMBER                       → collapsed
          COACH / PROGRAMMER / OWNER   → expanded
        User can always toggle. State is not persisted.
      */}
      {workout.coachNotes && workout.coachNotes.trim() !== '' && (
        <details
          className="bg-gray-900 rounded-lg px-4 py-3 border border-indigo-900/40"
          {...(gymRole && gymRole !== 'MEMBER' ? { open: true } : {})}
          data-testid="coach-notes"
        >
          <summary className="cursor-pointer text-sm font-semibold text-indigo-300 hover:text-indigo-200 select-none">
            Coach notes
          </summary>
          <div className="mt-2">
            <MarkdownDescription source={workout.coachNotes} />
          </div>
        </details>
      )}

      {/* Description */}
      {workout.description && (
        <div className="bg-gray-900 rounded-lg px-4 py-3">
          <MarkdownDescription source={workout.description} />
        </div>
      )}

      {/* Movements */}
      {(workout.workoutMovements?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {workout.workoutMovements?.map((wm) => (
            <span key={wm.movement.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
              {wm.movement.name}
            </span>
          ))}
        </div>
      )}

      {/* CrossFit source link */}
      {cfUrl && (
        <a
          href={cfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        >
          View on CrossFit.com →
        </a>
      )}

      {/* Log Result CTA */}
      {myResult ? (
        <div className="px-4 py-3 rounded-lg bg-gray-900 border border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your Result</span>
            <span className="text-sm font-medium text-white">{formatResultValue(myResult, workout?.tracksRounds)}</span>
            <span className="text-xs text-gray-400">{LEVEL_LABELS[myResult.level]}</span>
            <button
              onClick={() => setShowLogDrawer(true)}
              className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Edit
            </button>
          </div>
          {myResult.notes && (
            <p className="mt-1.5 text-xs text-gray-400 italic line-clamp-2">{myResult.notes}</p>
          )}
        </div>
      ) : (
        <Button variant="primary" onClick={() => setShowLogDrawer(true)} className="w-full py-2.5">
          Log Result
        </Button>
      )}

      {/* Results table */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Results</h2>
          <hr className="flex-1 border-gray-800" />
        </div>

        {/* Level filter: segmented control + Show-all checkbox */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <SegmentedControl
            options={LEVEL_OPTIONS}
            value={levelFilter}
            onChange={setLevelFilter}
            disabled={showAllLevels}
            aria-label="Filter results by level"
          />
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none min-h-7">
            <input
              type="checkbox"
              checked={showAllLevels}
              onChange={(e) => setShowAllLevels(e.target.checked)}
              className="accent-indigo-500 cursor-pointer"
            />
            Show all levels
          </label>
        </div>

        {/* Gender filter */}
        <div className="mb-4">
          <SegmentedControl
            options={GENDER_OPTIONS}
            value={genderFilter}
            onChange={setGenderFilter}
            aria-label="Filter results by gender"
          />
        </div>

        {/* Age division filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label htmlFor="division-select" className="text-xs text-gray-400 shrink-0">
            Division
          </label>
          <select
            id="division-select"
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value as DivisionFilter)}
            disabled={showAllDivisions}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40"
          >
            {AGE_DIVISIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none min-h-7">
            <input
              type="checkbox"
              checked={showAllDivisions}
              onChange={(e) => setShowAllDivisions(e.target.checked)}
              className="accent-indigo-500 cursor-pointer"
            />
            All divisions
          </label>
          {!user?.birthday && (
            <span className="text-xs text-gray-500">
              Add your{' '}
              <Link to="/profile" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                birthday
              </Link>{' '}
              to auto-select your division
            </span>
          )}
        </div>

        {filteredResults.length === 0 ? (
          <p className="text-sm text-gray-500">No results yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-400 w-10">#</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-400">Athlete</th>
                  <th className="pb-2 pr-4 text-xs font-medium text-gray-400">Level</th>
                  <th className="pb-2 text-xs font-medium text-gray-400">Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result, index) => {
                  const isMe = result.userId === user?.id
                  const displayName = result.user.name ?? 'Unknown'
                  const goToDetail = () => navigate(`/workouts/${workout.id}/results/${result.id}`)
                  return (
                    <Fragment key={result.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${isMe ? 'your' : `${displayName}'s`} result`}
                        onClick={goToDetail}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            goToDetail()
                          }
                        }}
                        className={[
                          result.notes ? '' : 'border-b border-gray-900',
                          isMe ? 'text-indigo-300' : 'text-gray-300',
                          'cursor-pointer hover:bg-gray-900/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                        ].join(' ')}
                      >
                        <td className="py-2.5 pr-4 text-gray-500">{index + 1}</td>
                        <td className="py-2.5 pr-4 font-medium">
                          <span className="flex items-center gap-2">
                            <Avatar
                              avatarUrl={result.user.avatarUrl}
                              firstName={result.user.firstName}
                              lastName={result.user.lastName}
                              email={result.user.email}
                              size="sm"
                            />
                            <span>{displayName}</span>
                            {isMe && <span className="text-xs text-indigo-400">(you)</span>}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-400">{LEVEL_LABELS[result.level]}</td>
                        <td className="py-2.5 font-mono">{formatResultValue(result, workout?.tracksRounds)}</td>
                      </tr>
                      {result.notes && (
                        <tr className="border-b border-gray-900">
                          <td />
                          <td colSpan={3} className="pb-2.5 max-w-0">
                            <p className="truncate text-xs text-gray-400 italic">{result.notes}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Your History — one section per movement, hidden when arrived from a past result link */}
      {user && !fromMovementHistory && (workout.workoutMovements?.length ?? 0) > 0 && (
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-gray-200">Your History</h2>
          {workout.workoutMovements.map((wm) => (
            <WorkoutMovementHistory
              key={wm.movement.id}
              movementId={wm.movement.id}
              movementName={wm.movement.name}
              currentWorkoutId={workout.id}
            />
          ))}
        </div>
      )}
    </div>

    {showLogDrawer && workout && (
      <LogResultDrawer
        workout={workout}
        existingResult={myResult ?? undefined}
        onClose={() => setShowLogDrawer(false)}
        onSaved={() => {
          setShowLogDrawer(false)
          api.results.leaderboard(id!).then(setResults).catch(() => {})
        }}
        onDeleted={() => {
          setShowLogDrawer(false)
          api.results.leaderboard(id!).then(setResults).catch(() => {})
        }}
      />
    )}
    </>
  )
}
