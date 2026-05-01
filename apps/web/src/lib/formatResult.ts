// Single source of truth for rendering a `Result.value` to a human-friendly
// string. Reads the new `{ score?, movementResults }` shape; for strength
// results with no workout-level score, summarizes the per-movement set count.

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
  movementResults?: MovementResultShape[]
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
    // Surface the heaviest single set as the headline number — that's the
    // figure leaderboards rank by and the one a member wants to see at a
    // glance. Ties on load break by reps so a 5×225 beats a 1×225.
    const heaviest = pickHeaviestSet(v.movementResults)
    if (heaviest) {
      const repsLabel = heaviest.reps ?? '?'
      const unitLabel = heaviest.unit ? ` ${heaviest.unit.toLowerCase()}` : ''
      return `${repsLabel} x ${heaviest.load}${unitLabel}`
    }
    // Movement results exist but no loads were recorded — fall back to a
    // count summary so the result row isn't blank.
    const sets = v.movementResults.reduce((n, mr) => n + (mr.sets?.length ?? 0), 0)
    return sets > 0 ? `${sets} set${sets === 1 ? '' : 's'} logged` : '—'
  }
  return '—'
}

// Cluster reps like "1.1.1" sort by their largest single chunk — matches the
// primary-score derivation rule, so leaderboard order and display agree.
function maxRepChunk(reps: string | undefined): number {
  if (!reps) return 0
  const parts = reps.split('.').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
  return parts.length ? Math.max(...parts) : 0
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
