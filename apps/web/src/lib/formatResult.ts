// Single source of truth for rendering a `Result.value` to a human-friendly
// string. Reads the new `{ score?, movementResults }` shape; for strength
// results with no workout-level score, summarizes the per-movement set count.

interface ResultValueShape {
  score?: {
    kind: 'ROUNDS_REPS' | 'TIME' | 'LOAD' | 'DISTANCE' | 'CALORIES' | 'REPS'
    rounds?: number
    reps?: number
    seconds?: number
    cappedOut?: boolean
    load?: number
    unit?: string
    distance?: number
    calories?: number
  }
  movementResults?: { sets?: unknown[] }[]
}

function formatSeconds(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatResultValue(value: Record<string, unknown> | undefined | null): string {
  if (!value) return '—'
  const v = value as unknown as ResultValueShape
  const score = v.score
  if (score) {
    switch (score.kind) {
      case 'ROUNDS_REPS': {
        if (score.cappedOut && (score.reps ?? 0) === 0 && !score.rounds) return 'CAPPED'
        return score.rounds !== undefined
          ? `${score.rounds} rounds + ${score.reps ?? 0} reps`
          : `${score.reps ?? 0} reps`
      }
      case 'TIME':     return score.cappedOut ? 'CAPPED' : formatSeconds(score.seconds ?? 0)
      case 'LOAD':     return `${score.load} ${(score.unit ?? '').toLowerCase()}`.trim()
      case 'DISTANCE': return `${score.distance} ${(score.unit ?? '').toLowerCase()}`.trim()
      case 'CALORIES': return `${score.calories} cal`
      case 'REPS':     return `${score.reps ?? 0} reps`
    }
  }
  if (v.movementResults && v.movementResults.length > 0) {
    const sets = v.movementResults.reduce((n, mr) => n + (mr.sets?.length ?? 0), 0)
    return sets > 0 ? `${sets} set${sets === 1 ? '' : 's'} logged` : '—'
  }
  return '—'
}
