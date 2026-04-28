import type { ResultValue } from './api'

const TYPE_ABBR: Record<string, string> = {
  WARMUP: 'W', STRENGTH: 'S', AMRAP: 'A',
  FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C', METCON: 'M',
}

export function workoutTypeAbbr(type: string): string {
  return TYPE_ABBR[type] ?? '?'
}

export function formatResultValue(value: ResultValue): string {
  if (value.type === 'AMRAP') return `${value.rounds} rds + ${value.reps} reps`
  const mins = Math.floor(value.seconds / 60)
  const secs = value.seconds % 60
  const time = `${mins}:${String(secs).padStart(2, '0')}`
  return value.cappedOut ? `${time} (capped)` : time
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
