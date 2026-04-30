/**
 * Unit-style tests for the bulk-upload parser (slice 6 / #89). The parser is
 * a pure function so we run it without booting the API or DB.
 *
 * Run: cd apps/api && npx tsx tests/workout-import-parser.ts
 */

import { parseWorkoutImportFile, ParseFatalError } from '../src/lib/workoutImportParser.js'

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

function buf(s: string) {
  return Buffer.from(s, 'utf8')
}

async function tests() {
  console.log('=== Happy path ===')
  {
    const csv = `date,title,type,description
2026-05-04,Back Squat 5x5,STRENGTH,5 sets of 5
2026-05-05,Run 5K,RUNNING,Easy pace
`
    const result = await parseWorkoutImportFile(buf(csv), 'happy.csv')
    check('rows parsed', 2, result.rows.length)
    check('rowCount equals data row count', 2, result.rowCount)
    check('no errors', 0, result.errors.length)
    check('no warnings', 0, result.warnings.length)
    check('date carried through', '2026-05-04', result.rows[0]?.date)
    check('type coerced', 'STRENGTH', result.rows[0]?.type)
  }

  console.log('\n=== Optional columns + named workout ===')
  {
    const csv = `date,order,title,type,description,named_workout,source
2026-05-04,2,Diane,FOR_TIME,21-15-9,Diane,.com 2025
`
    const result = await parseWorkoutImportFile(buf(csv), 'extras.csv')
    check('order parsed', 2, result.rows[0]?.dayOrder)
    check('named_workout passed through', 'Diane', result.rows[0]?.namedWorkout)
    check('source passed through', '.com 2025', result.rows[0]?.source)
  }

  console.log('\n=== Multi-line cells in quoted CSV ===')
  {
    const csv = `date,title,type,description
2026-05-04,"Cindy","AMRAP","AMRAP 20:
5 Pull-ups
10 Push-ups
15 Squats"
`
    const result = await parseWorkoutImportFile(buf(csv), 'multiline.csv')
    check('multi-line description preserved', true, (result.rows[0]?.description ?? '').includes('Pull-ups'))
    check('multi-line description has trailing line', true, (result.rows[0]?.description ?? '').includes('15 Squats'))
  }

  console.log('\n=== Slash dates and Excel-serial dates ===')
  {
    const csv = `date,title,type,description
5/4/2026,Slash Date,STRENGTH,Body
`
    const result = await parseWorkoutImportFile(buf(csv), 'slash.csv')
    check('slash date normalized', '2026-05-04', result.rows[0]?.date)
    check('warning surfaced for slash date', true, result.warnings.some((w) => w.column === 'date'))
  }

  console.log('\n=== Orphan rows skipped with warning ===')
  {
    const csv = `date,title,type,description
,,,
2026-05-04,Real Workout,STRENGTH,Body
`
    const result = await parseWorkoutImportFile(buf(csv), 'orphans.csv')
    check('orphan row skipped', 1, result.rows.length)
    check('orphan row warning', true, result.warnings.some((w) => /no workout content/i.test(w.message)))
  }

  console.log('\n=== Per-row errors ===')
  {
    const csv = `date,title,type,description
not-a-date,Workout,STRENGTH,Body
2026-05-04,,STRENGTH,Body
2026-05-04,Workout,UNKNOWN_TYPE,Body
`
    const result = await parseWorkoutImportFile(buf(csv), 'errors.csv')
    check('all bad rows excluded from rows[]', 0, result.rows.length)
    check('error captured for bad date', true, result.errors.some((e) => e.column === 'date'))
    check('error captured for missing title', true, result.errors.some((e) => e.column === 'title'))
    check('error captured for unknown type', true, result.errors.some((e) => e.column === 'type'))
  }

  console.log('\n=== Header validation ===')
  {
    const csv = `date,title,description
2026-05-04,Workout,Body
`
    let caught = false
    let issueCount = 0
    try {
      await parseWorkoutImportFile(buf(csv), 'no-type.csv')
    } catch (err) {
      caught = err instanceof ParseFatalError
      if (err instanceof ParseFatalError) issueCount = err.issues.length
    }
    check('throws ParseFatalError on missing required header', true, caught)
    check('error mentions the missing column', true, issueCount > 0)
  }

  console.log('\n=== Unknown columns warned, not errored ===')
  {
    const csv = `date,title,type,description,not_a_column
2026-05-04,Workout,STRENGTH,Body,foo
`
    const result = await parseWorkoutImportFile(buf(csv), 'unknown-col.csv')
    check('rows still parsed', 1, result.rows.length)
    check('unknown column surfaced as warning', true, result.warnings.some((w) => /Unknown columns/i.test(w.message)))
  }

  console.log('\n=== Unsupported file type ===')
  {
    let caught = false
    try {
      await parseWorkoutImportFile(buf('plain text'), 'notes.txt')
    } catch (err) {
      caught = err instanceof ParseFatalError
    }
    check('rejects non-csv non-xlsx file', true, caught)
  }
}

;(async () => {
  try {
    await tests()
  } catch (err) {
    console.error('FATAL:', err)
    fail++
  } finally {
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
    if (fail > 0) process.exit(1)
  }
})()
