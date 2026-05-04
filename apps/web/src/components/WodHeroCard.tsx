import { Link } from 'react-router-dom'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles.ts'
import { formatResultValue } from '../lib/formatResult.ts'
import Button from './ui/Button.tsx'
import type { Workout, DashboardTodayResult, DashboardLeaderboard } from '../lib/api.ts'

interface Props {
  workout: Workout
  myResult: DashboardTodayResult | null
  leaderboard: DashboardLeaderboard | null
  gymMemberCount: number
  compact?: boolean
}

const LEVEL_LABELS: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function formatDateHeader(scheduledAt: string): string {
  const d = new Date(scheduledAt)
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const date = d.getUTCDate()
  const todayUtc = new Date().toISOString().slice(0, 10)
  const isToday = scheduledAt.slice(0, 10) === todayUtc
  return `${day} · ${month} ${date}${isToday ? ' · TODAY' : ''}`
}

function formatCap(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m} min cap` : `${m}:${String(s).padStart(2, '0')} cap`
}

export default function WodHeroCard({ workout, myResult, leaderboard, gymMemberCount, compact = false }: Props) {
  const typeStyle = WORKOUT_TYPE_STYLES[workout.type]
  const scored = myResult ? formatResultValue(myResult.value) : null
  const levelLabel = myResult ? (LEVEL_LABELS[myResult.level] ?? myResult.level) : null

  return (
    <article
      className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden ${compact ? 'p-4' : 'p-6 md:p-7'}`}
      aria-label={`Today's workout: ${workout.title}`}
    >
      {/* Accent strip */}
      <div className={`-mt-4 -mx-4 mb-4 h-1 ${typeStyle.accentBar.replace('border', 'bg')} md:-mt-7 md:-mx-7 md:mb-6`} aria-hidden="true" />

      {/* Header row: date + badges */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[11px] font-bold tracking-[0.1em] text-gray-400 uppercase">
          {formatDateHeader(workout.scheduledAt)}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${typeStyle.tint} ${typeStyle.bg}`}>
          {typeStyle.abbr}
        </span>
        {workout.namedWorkout?.category === 'BENCHMARK' && (
          <span className="text-xs font-bold px-2 py-0.5 rounded text-indigo-300 bg-indigo-500/15">
            BENCHMARK
          </span>
        )}
      </div>

      {/* Title row */}
      <div className={`flex items-start justify-between gap-4 ${compact ? 'flex-col' : 'md:flex-row flex-col'} mb-4`}>
        <div className="min-w-0">
          <h2 className={`font-bold tracking-tight text-white leading-tight ${compact ? 'text-2xl' : 'text-3xl md:text-4xl'}`}>
            <Link
              to={`/workouts/${workout.id}`}
              className="hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
            >
              {workout.title}
            </Link>
          </h2>
          {workout.timeCapSeconds && (
            <p className="mt-1 text-sm text-gray-400">{formatCap(workout.timeCapSeconds)}</p>
          )}
          {workout.program && (
            <p className="mt-1 text-sm text-gray-500">via {workout.program.name}</p>
          )}
        </div>

        {/* Result card (logged) or CTAs (not logged) */}
        {myResult ? (
          <ResultCard result={myResult} leaderboard={leaderboard} scored={scored} levelLabel={levelLabel} workoutId={workout.id} compact={compact} />
        ) : (
          <div className={`flex flex-row gap-2 ${compact ? 'w-full' : 'items-center flex-shrink-0'}`}>
            <Button variant="primary" className={compact ? 'flex-1' : undefined}>
              <Link to={`/workouts/${workout.id}`} className="contents">Start workout</Link>
            </Button>
            <Button variant="secondary" className={compact ? 'flex-1' : undefined}>
              <Link to={`/workouts/${workout.id}`} className="contents">Log result</Link>
            </Button>
          </div>
        )}
      </div>

      {/* Desktop-only workout detail blocks */}
      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          {workout.description && (
            <div className="bg-gray-800/60 rounded-xl border border-gray-800 p-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-2">Workout</p>
              <p className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">{workout.description}</p>
            </div>
          )}
          {workout.workoutMovements.length > 0 && (
            <div className="bg-gray-800/60 rounded-xl border border-gray-800 p-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-2">Movements</p>
              <ul className="space-y-1">
                {workout.workoutMovements.map((wm) => (
                  <li key={wm.movement.id} className="text-sm text-gray-200 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" aria-hidden="true" />
                    {wm.movement.name}
                    {wm.sets && <span className="text-gray-500">{wm.sets}×{wm.reps ?? '?'}</span>}
                    {wm.load && <span className="text-gray-500">{wm.load} {wm.loadUnit?.toLowerCase()}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Compact: tap-through link */}
      {compact && (
        <Link
          to={`/workouts/${workout.id}`}
          className="block mb-4 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View workout details →
        </Link>
      )}

      {/* Participant footer */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t border-gray-800 text-sm text-gray-400 flex-wrap">
        <span>
          <span className="text-white font-semibold">{leaderboard?.totalLogged ?? 0}</span>
          {gymMemberCount > 0 ? ` of ${gymMemberCount}` : ''} member{gymMemberCount !== 1 ? 's' : ''} logged today
        </span>
        <Link
          to={`/workouts/${workout.id}`}
          className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 rounded"
        >
          See leaderboard →
        </Link>
      </div>
    </article>
  )
}

interface ResultCardProps {
  result: DashboardTodayResult
  leaderboard: DashboardLeaderboard | null
  scored: string | null
  levelLabel: string | null
  workoutId: string
  compact: boolean
}

function ResultCard({ result, leaderboard, scored, levelLabel, workoutId, compact }: ResultCardProps) {
  const loggedTime = new Date(result.createdAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  if (compact) {
    return (
      <div className="w-full bg-gray-800/60 rounded-xl border border-gray-700 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-[0.08em] text-emerald-400 uppercase">
              ✓ Logged {loggedTime}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white leading-none tabular-nums">{scored ?? '—'}</span>
            {levelLabel && (
              <span className="text-xs font-bold text-indigo-300">{levelLabel}</span>
            )}
          </div>
        </div>
        {leaderboard?.rank && (
          <div className="text-right flex-shrink-0">
            <div className="text-base font-bold text-white">#{leaderboard.rank}</div>
            <div className="text-xs text-gray-400">of {leaderboard.totalLogged}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 bg-gray-800/60 rounded-xl border border-gray-700 p-5 min-w-[220px] max-w-[280px]">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-bold tracking-[0.08em] text-emerald-400 uppercase">
          ✓ Logged · {loggedTime}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-4xl font-bold text-white leading-none tabular-nums">{scored ?? '—'}</span>
        {levelLabel && (
          <span className="text-sm font-bold text-indigo-300">{levelLabel}</span>
        )}
      </div>
      {leaderboard?.rank && (
        <div className="text-sm text-gray-400">
          Rank <span className="text-white font-semibold">#{leaderboard.rank}</span> of {leaderboard.totalLogged} today
          {leaderboard.percentile !== null && ` · top ${100 - leaderboard.percentile}%`}
        </div>
      )}
      <div className="mt-3">
        <Link
          to={`/workouts/${workoutId}`}
          className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          View board →
        </Link>
      </div>
    </div>
  )
}
