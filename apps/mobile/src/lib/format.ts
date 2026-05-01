import type { ResultValue } from './api'

const TYPE_ABBR: Record<string, string> = {
  // Strength
  STRENGTH: 'S', POWER_LIFTING: 'PL', WEIGHT_LIFTING: 'WL', BODY_BUILDING: 'BB', MAX_EFFORT: 'ME',
  // Metcon
  AMRAP: 'A', FOR_TIME: 'F', EMOM: 'E', METCON: 'M', TABATA: 'TB', INTERVALS: 'IN', CHIPPER: 'CH', LADDER: 'LD', DEATH_BY: 'DB',
  // MonoStructural
  CARDIO: 'C', RUNNING: 'RN', ROWING: 'RW', BIKING: 'BK', SWIMMING: 'SW', SKI_ERG: 'SK', MIXED_MONO: 'MM',
  // Skill Work
  GYMNASTICS: 'GM', WEIGHTLIFTING_TECHNIQUE: 'WT',
  // Warmup / Recovery
  WARMUP: 'W', MOBILITY: 'MB', COOLDOWN: 'CD',
}

export function workoutTypeAbbr(type: string): string {
  return TYPE_ABBR[type] ?? '?'
}

function formatTime(seconds: number, cappedOut: boolean): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const time = `${mins}:${String(secs).padStart(2, '0')}`
  return cappedOut ? `${time} (capped)` : time
}

// Cluster reps like "1.1.1" sort by their largest single chunk — matches the
// primary-score derivation rule, so leaderboard order and display agree.
function maxRepChunk(reps: string | undefined): number {
  if (!reps) return 0
  const parts = reps.split('.').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
  return parts.length ? Math.max(...parts) : 0
}

interface SetShape {
  reps?: string
  load?: number
  tempo?: string
  distance?: number
  calories?: number
  seconds?: number
}

interface MovementResultShape {
  workoutMovementId?: string
  loadUnit?: string
  distanceUnit?: string
  sets?: SetShape[]
}

function pickHeaviestSet(movementResults: MovementResultShape[]): { reps: string | undefined; load: number; unit: string | undefined } | null {
  let best: { reps: string | undefined; load: number; unit: string | undefined; rank: number } | null = null
  for (const mr of movementResults) {
    for (const s of mr.sets ?? []) {
      if (s.load === undefined) continue
      const rank = maxRepChunk(s.reps)
      if (!best || s.load > best.load || (s.load === best.load && rank > best.rank)) {
        best = { reps: s.reps, load: s.load, unit: mr.loadUnit, rank }
      }
    }
  }
  return best ? { reps: best.reps, load: best.load, unit: best.unit } : null
}

export function formatResultValue(value: ResultValue): string {
  const s = value.score
  if (s) {
    switch (s.kind) {
      case 'ROUNDS_REPS':
        return s.rounds !== undefined ? `${s.rounds} rds + ${s.reps} reps` : `${s.reps} reps`
      case 'TIME':       return formatTime(s.seconds, s.cappedOut ?? false)
      case 'LOAD':       return `${s.load} ${s.unit.toLowerCase()}`
      case 'DISTANCE':   return `${s.distance} ${s.unit.toLowerCase()}`
      case 'CALORIES':   return `${s.calories} cal`
      case 'REPS':       return `${s.reps} reps`
    }
  }
  // Strength results: surface the heaviest single set as the headline number
  // — that's the figure leaderboards rank by and the one a member wants to
  // see at a glance. Ties on load break by maxRepChunk (cluster reps "1.1.1"
  // → 1) so a 5×225 still beats a 1×225. Mirrors apps/web/src/lib/formatResult.ts.
  if (value.movementResults && value.movementResults.length > 0) {
    const heaviest = pickHeaviestSet(value.movementResults as MovementResultShape[])
    if (heaviest) {
      const repsLabel = heaviest.reps ?? '?'
      const unitLabel = heaviest.unit ? ` ${heaviest.unit.toLowerCase()}` : ''
      return `${repsLabel} x ${heaviest.load}${unitLabel}`
    }
    // Movement results exist but no loads were recorded — fall back to a
    // count summary so the result row isn't blank.
    const setCount = value.movementResults.reduce((n, mr) => n + mr.sets.length, 0)
    return setCount > 0 ? `${setCount} set${setCount === 1 ? '' : 's'} logged` : '—'
  }
  return '—'
}

// "April 2026" — used to group history results into month blocks.
export function monthKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// "Apr 27" — short row-level date.
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
