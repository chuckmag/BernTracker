import type { ResultValue } from './api'

const TYPE_ABBR: Record<string, string> = {
  WARMUP: 'W', STRENGTH: 'S', AMRAP: 'A',
  FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C', METCON: 'M',
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
  // Strength workouts derive their score from `movementResults`. The
  // human-friendly summary lives in slices 2/3 (the new sets-table UI). For
  // now, surface a count.
  if (value.movementResults && value.movementResults.length > 0) {
    const setCount = value.movementResults.reduce((n, mr) => n + mr.sets.length, 0)
    return `${setCount} set${setCount === 1 ? '' : 's'} logged`
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
