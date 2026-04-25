import type { WorkoutType } from '@berntracker/db'

/**
 * Best-effort classification of a free-form WOD description into a
 * `WorkoutType`. Order of checks matters — first match wins:
 *
 *   AMRAP keyword         → AMRAP
 *   EMOM / "every N min"  → EMOM
 *   "for time"            → FOR_TIME
 *   else                  → METCON   (catch-all conditioning)
 *
 * Intentionally conservative. Anything we can't confidently categorize falls
 * through to METCON so a human reviewing the workout can re-tag it later.
 */
export function classifyWorkoutType(descriptionRaw: string): WorkoutType {
  if (/\bAMRAP\b/i.test(descriptionRaw)) return 'AMRAP'
  if (/\bEMOM\b/i.test(descriptionRaw) || /every\s+\d+\s+(minutes?|min)\b/i.test(descriptionRaw)) {
    return 'EMOM'
  }
  if (/\bfor\s+time\b/i.test(descriptionRaw)) return 'FOR_TIME'
  return 'METCON'
}
