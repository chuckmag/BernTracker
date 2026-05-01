import type { ResultValue, MovementResult, LoadUnit, DistanceUnit } from './result.js'

// Stored on `Result.primaryScoreKind` — the leaderboard ranking axis. Mirrors
// the kinds a Score can take, plus 'LOAD' is also produced when a Strength
// result derives its score from `movementResults` (max load * reps).
export type PrimaryScoreKind =
  | 'LOAD'
  | 'TIME'
  | 'ROUNDS_REPS'
  | 'DISTANCE'
  | 'CALORIES'
  | 'REPS'

export interface PrimaryScore {
  kind: PrimaryScoreKind
  value: number
}

// Capped-out for-time results sort after every finisher. Adding a large
// addend keeps the column sortable as a single Float without a separate
// boolean column.
const TIME_CAP_PENALTY = 1_000_000_000

const LB_TO_KG = 0.453592
function loadToKg(load: number, unit: LoadUnit | undefined): number {
  return unit === 'KG' ? load : load * LB_TO_KG
}

const DISTANCE_TO_M: Record<DistanceUnit, number> = {
  M: 1,
  KM: 1000,
  MI: 1609.344,
  FT: 0.3048,
  YD: 0.9144,
}
function distanceToMeters(d: number, unit: DistanceUnit | undefined): number {
  return d * (unit ? DISTANCE_TO_M[unit] : 1)
}

// Cluster reps like "1.1.1" rank by their largest single chunk, not the
// sum: clustering enables heavier work at lower fatigue, so a cluster of
// singles isn't equivalent to a straight set of N for ranking purposes.
function maxRepChunk(reps: string | undefined): number {
  if (!reps) return 1
  const parts = reps.split('.').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
  return parts.length ? Math.max(...parts) : 1
}

function deriveStrengthScore(movementResults: MovementResult[]): PrimaryScore | null {
  let best: PrimaryScore | null = null
  for (const mr of movementResults) {
    for (const set of mr.sets) {
      if (set.load === undefined) continue
      const loadKg = loadToKg(set.load, mr.loadUnit)
      const reps = maxRepChunk(set.reps)
      const score = loadKg * reps
      if (!best || score > best.value) best = { kind: 'LOAD', value: score }
    }
  }
  return best
}

// Returns the primary score the leaderboard should rank a result by, or
// `null` when the result has neither a workout-level score nor any
// load-bearing sets to derive one from. Derivation rules:
//
//   - score.kind === 'ROUNDS_REPS' → rounds*1000 + reps
//   - score.kind === 'TIME'        → seconds (+penalty if cappedOut)
//   - score.kind === 'LOAD'        → load normalized to kg
//   - score.kind === 'DISTANCE'    → distance normalized to meters
//   - score.kind === 'CALORIES'    → calories
//   - score.kind === 'REPS'        → reps
//   - movementResults only         → max(loadKg * maxRepChunk) across sets
//
// Caller writes the returned `kind` and `value` to
// `Result.primaryScoreKind` / `Result.primaryScoreValue`.
export function derivePrimaryScore(value: ResultValue): PrimaryScore | null {
  if (value.score) {
    const s = value.score
    switch (s.kind) {
      case 'ROUNDS_REPS':
        return { kind: 'ROUNDS_REPS', value: (s.rounds ?? 0) * 1000 + s.reps }
      case 'TIME':
        return { kind: 'TIME', value: s.seconds + (s.cappedOut ? TIME_CAP_PENALTY : 0) }
      case 'LOAD':
        return { kind: 'LOAD', value: loadToKg(s.load, s.unit) }
      case 'DISTANCE':
        return { kind: 'DISTANCE', value: distanceToMeters(s.distance, s.unit) }
      case 'CALORIES':
        return { kind: 'CALORIES', value: s.calories }
      case 'REPS':
        return { kind: 'REPS', value: s.reps }
    }
  }
  if (value.movementResults && value.movementResults.length > 0) {
    return deriveStrengthScore(value.movementResults)
  }
  return null
}
