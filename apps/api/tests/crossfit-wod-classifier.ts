/**
 * Unit tests for the CrossFit WOD WorkoutType classifier.
 *
 * Pure-logic tests — no API or DB required.
 * Run via `npm test` from apps/api (along with the integration tests).
 */

import { classifyWorkoutType } from '../src/lib/crossfitWodClassifier.js'

let pass = 0
let fail = 0

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

console.log('classifyWorkoutType')

// ── AMRAP ────────────────────────────────────────────────────────────────────
check('detects AMRAP keyword', 'AMRAP', classifyWorkoutType('AMRAP 12:\n10 pull-ups\n20 push-ups'))
check('detects AMRAP case-insensitive', 'AMRAP', classifyWorkoutType('amrap 20 of: ...'))

// ── EMOM ─────────────────────────────────────────────────────────────────────
check('detects EMOM keyword', 'EMOM', classifyWorkoutType('EMOM 10:\n10 deadlifts'))
check('detects "every N minutes" phrasing', 'EMOM', classifyWorkoutType('Every 2 minutes for 20 minutes:\n5 cleans'))
check('detects "every N min" phrasing', 'EMOM', classifyWorkoutType('Every 90 min, complete...'))

// ── FOR_TIME ─────────────────────────────────────────────────────────────────
check('detects "For time:"', 'FOR_TIME', classifyWorkoutType('For time:\n400m run\n50 burpees'))
check('detects "for time" mid-sentence', 'FOR_TIME', classifyWorkoutType('Complete the following for time, with a partner:\n...'))

// ── METCON fallback ──────────────────────────────────────────────────────────
check('falls through to METCON when unknown', 'METCON', classifyWorkoutType('5 rounds:\n10 power cleans @ 135/95'))
check('falls through to METCON for empty string', 'METCON', classifyWorkoutType(''))
check('falls through to METCON for narrative-only text', 'METCON', classifyWorkoutType('Workout dedicated to the memory of...'))

// ── Precedence: AMRAP wins over "for time" if both keywords are present ──────
check('AMRAP wins over for time when both keywords present', 'AMRAP', classifyWorkoutType('AMRAP 15 — score for time'))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
