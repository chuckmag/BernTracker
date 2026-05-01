/**
 * Integration tests for slice 6 / #89 — bulk CSV/XLSX workout upload.
 *
 * Lifecycle exercised: PENDING → DRAFT → PUBLISHED, plus FAILED for fatal
 * parses. Auth matrix: OWNER + PROGRAMMER (managers) accepted; COACH +
 * MEMBER + no-auth refused. File-cap enforcement.
 *
 * Requires: API running on localhost:3000, DB accessible via DATABASE_URL.
 * Run: cd apps/api && npx tsx tests/programs-imports.ts
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
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

async function jsonReq(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

async function uploadCsv(programId: string, csv: string, filename: string, token?: string) {
  const fd = new FormData()
  fd.append('file', new Blob([csv], { type: 'text/csv' }), filename)
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}/programs/${programId}/imports`, {
    method: 'POST',
    headers,
    body: fd,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

const TS = Date.now()
let gymId = ''
let programId = ''
let otherProgramId = ''
let ownerToken = ''
let programmerToken = ''
let coachToken = ''
let memberToken = ''
const createdImportIds: string[] = []
const createdWorkoutIds: string[] = []

async function setup() {
  console.log('=== Setup ===')

  const gym = await prisma.gym.create({
    data: { name: `Imports Gym ${TS}`, slug: `imports-gym-${TS}` },
  })
  gymId = gym.id

  const program = await prisma.program.create({
    data: {
      name: `Imports Program ${TS}`,
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-06-01'),
      gyms: { create: { gymId } },
    },
  })
  programId = program.id

  const other = await prisma.program.create({
    data: {
      name: `Other Imports Program ${TS}`,
      startDate: new Date('2026-05-01'),
      // No gym link — used to confirm 404 on cross-program access.
    },
  })
  otherProgramId = other.id

  // Seed a NamedWorkout so we can assert that named_workout strings resolve.
  await prisma.namedWorkout.upsert({
    where: { name: 'Diane' },
    update: {},
    create: { name: 'Diane', category: 'GIRL_WOD', aliases: ['DIANE'] },
  })

  const roleUsers: Record<string, { id: string; token: string }> = {}
  for (const role of ['OWNER', 'PROGRAMMER', 'COACH', 'MEMBER'] as const) {
    const u = await prisma.user.create({
      data: { email: `${role.toLowerCase()}-imports-${TS}@test.com`, role: 'MEMBER' },
    })
    await prisma.userGym.create({ data: { userId: u.id, gymId, role } })
    const { accessToken } = signTokenPair(u.id, 'MEMBER')
    roleUsers[role] = { id: u.id, token: accessToken }
  }
  ownerToken = roleUsers.OWNER.token
  programmerToken = roleUsers.PROGRAMMER.token
  coachToken = roleUsers.COACH.token
  memberToken = roleUsers.MEMBER.token

  console.log(`  programId=${programId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  if (createdWorkoutIds.length > 0) {
    await prisma.workout.deleteMany({ where: { id: { in: createdWorkoutIds } } })
  }
  // Cascade from program deletion clears imports + workouts
  if (programId) await prisma.program.delete({ where: { id: programId } }).catch(() => undefined)
  if (otherProgramId) await prisma.program.delete({ where: { id: otherProgramId } }).catch(() => undefined)
  if (gymId) await prisma.gym.delete({ where: { id: gymId } }).catch(() => undefined)
  await prisma.user.deleteMany({ where: { email: { endsWith: `-imports-${TS}@test.com` } } })
  await prisma.namedWorkout.delete({ where: { name: 'Diane' } }).catch(() => undefined)
  console.log('  cleaned up')
}

const HAPPY_CSV = `date,order,title,type,description,named_workout,source
2026-05-04,1,Back Squat 5x5,STRENGTH,5x5 Back Squat,,
2026-05-04,2,Diane,FOR_TIME,"21-15-9 Deadlifts (225/155) and HSPU",Diane,
2026-05-05,1,Run 5K,RUNNING,Run 5000m at conversational pace,,
`

async function tests() {
  await setup()

  console.log('\n=== Auth matrix ===')
  {
    const r1 = await uploadCsv(programId, HAPPY_CSV, 'happy.csv')
    check('POST /imports no auth → 401', 401, r1.status)
    const r2 = await uploadCsv(programId, HAPPY_CSV, 'happy.csv', memberToken)
    check('POST /imports as MEMBER → 403', 403, r2.status)
    const r3 = await uploadCsv(programId, HAPPY_CSV, 'happy.csv', coachToken)
    check('POST /imports as COACH → 403', 403, r3.status)
  }

  console.log('\n=== Happy path: PENDING → DRAFT → PUBLISHED ===')
  let importId = ''
  {
    const r = await uploadCsv(programId, HAPPY_CSV, 'happy.csv', programmerToken)
    check('POST /imports as PROGRAMMER → 201', 201, r.status)
    importId = String(r.body.importId ?? '')
    if (importId) createdImportIds.push(importId)
    check('Response carries importId', true, importId.length > 0)
    const preview = r.body.preview as Record<string, unknown> | undefined
    const rows = preview?.rows as Array<{ namedWorkoutId: string | null; namedWorkout: string | null }> | undefined
    check('Preview includes 3 rows', 3, rows?.length ?? 0)
    const dianeRow = rows?.find((row) => row.namedWorkout === 'Diane')
    check('Diane row resolved namedWorkoutId', true, !!dianeRow?.namedWorkoutId)
    const dbRow = await prisma.workoutImport.findUnique({ where: { id: importId } })
    check('WorkoutImport persisted with status PENDING', 'PENDING', dbRow?.status)
  }

  {
    const r = await jsonReq('POST', `/programs/${programId}/imports/${importId}/draft`, programmerToken)
    check('POST /draft → 200', 200, r.status)
    check('createdCount = 3', 3, r.body.createdCount)
    const ids = r.body.workoutIds as string[]
    if (ids) createdWorkoutIds.push(...ids)
    const importRow = await prisma.workoutImport.findUnique({ where: { id: importId } })
    check('Import status flipped to DRAFT', 'DRAFT', importRow?.status)
    const drafts = await prisma.workout.findMany({ where: { importId } })
    check('3 Workout rows linked back via importId', 3, drafts.length)
    check('All workouts created as DRAFT', true, drafts.every((d) => d.status === 'DRAFT'))
    check('All workouts inherit programId', true, drafts.every((d) => d.programId === programId))
  }

  {
    const r = await jsonReq('POST', `/programs/${programId}/imports/${importId}/publish`, programmerToken)
    check('POST /publish → 200', 200, r.status)
    check('publishedCount = 3', 3, r.body.publishedCount)
    const importRow = await prisma.workoutImport.findUnique({ where: { id: importId } })
    check('Import status flipped to PUBLISHED', 'PUBLISHED', importRow?.status)
    const drafts = await prisma.workout.findMany({ where: { importId } })
    check('All workouts now PUBLISHED', true, drafts.every((d) => d.status === 'PUBLISHED'))
  }

  console.log('\n=== Idempotent re-publish ===')
  {
    const r = await jsonReq('POST', `/programs/${programId}/imports/${importId}/publish`, programmerToken)
    check('POST /publish (already published) → 200', 200, r.status)
    check('Re-publish reports 0 newly published', 0, r.body.publishedCount)
  }

  console.log('\n=== Re-upload surfaces collisions ===')
  {
    const r = await uploadCsv(programId, HAPPY_CSV, 'happy-again.csv', programmerToken)
    check('POST /imports re-upload → 201', 201, r.status)
    const reImportId = String(r.body.importId ?? '')
    if (reImportId) createdImportIds.push(reImportId)
    const preview = r.body.preview as { rows: Array<{ collision: boolean }> }
    check('Every re-upload row flagged as collision', true, preview.rows.every((row) => row.collision))

    // /draft on an all-collision preview produces zero new workouts (skip-default behaviour).
    const draft = await jsonReq('POST', `/programs/${programId}/imports/${reImportId}/draft`, programmerToken)
    check('POST /draft on all-collision preview → 200', 200, draft.status)
    check('No new workouts created (all skipped)', 0, draft.body.createdCount)
  }

  console.log('\n=== Blocking errors prevent draft ===')
  {
    const badCsv = `date,order,title,type,description
not-a-date,1,Bad Workout,STRENGTH,Should fail parsing
2026-05-08,1,Missing Type Workout,NOT_A_TYPE,Body
`
    const r = await uploadCsv(programId, badCsv, 'bad.csv', programmerToken)
    check('POST /imports with row errors → 201', 201, r.status)
    const badImportId = String(r.body.importId ?? '')
    if (badImportId) createdImportIds.push(badImportId)
    const preview = r.body.preview as { errors: unknown[] }
    check('Preview has blocking errors', true, preview.errors.length > 0)
    const draft = await jsonReq('POST', `/programs/${programId}/imports/${badImportId}/draft`, programmerToken)
    check('POST /draft refuses while errors present → 400', 400, draft.status)
  }

  console.log('\n=== Fatal parse errors → FAILED ===')
  {
    const headerlessCsv = `2026-05-04,Header missing,STRENGTH,Body\n`
    const r = await uploadCsv(programId, headerlessCsv, 'bad-header.csv', programmerToken)
    check('POST /imports without required headers → 400', 400, r.status)
    const failedImportId = String(r.body.importId ?? '')
    if (failedImportId) createdImportIds.push(failedImportId)
    if (failedImportId) {
      const dbRow = await prisma.workoutImport.findUnique({ where: { id: failedImportId } })
      check('FAILED row stored with errorJson', 'FAILED', dbRow?.status)
      check('FAILED row has no parsedJson', true, dbRow?.parsedJson == null)
    }
  }

  console.log('\n=== File-size cap ===')
  {
    // 6 MB blob — exceeds the 5 MB cap.
    const big = 'a'.repeat(6 * 1024 * 1024)
    const fd = new FormData()
    fd.append('file', new Blob([big], { type: 'text/csv' }), 'too-big.csv')
    const res = await fetch(`${BASE}/programs/${programId}/imports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${programmerToken}` },
      body: fd,
    })
    check('POST /imports > 5MB → 413', 413, res.status)
  }

  console.log('\n=== Cross-program isolation ===')
  {
    // The owner token is for `gymId`; otherProgramId has no gym link, so 404.
    const r = await uploadCsv(otherProgramId, HAPPY_CSV, 'cross.csv', ownerToken)
    check('POST /imports for unlinked program → 403/404', true, r.status === 403 || r.status === 404)
  }

  console.log('\n=== List + get import history ===')
  {
    const r = await jsonReq('GET', `/programs/${programId}/imports`, programmerToken)
    check('GET /imports → 200', 200, r.status)
    const list = r.body as unknown as { id: string }[]
    check('List contains every created import for this program', true, createdImportIds.every((id) => list.some((row) => row.id === id)))
  }
  {
    if (importId) {
      const r = await jsonReq('GET', `/programs/${programId}/imports/${importId}`, programmerToken)
      check('GET /imports/:id → 200', 200, r.status)
      check('Detail includes preview payload', true, !!r.body.preview)
    }
    const r404 = await jsonReq('GET', `/programs/${programId}/imports/does-not-exist`, programmerToken)
    check('GET /imports/missing → 404', 404, r404.status)
  }
}

;(async () => {
  try {
    await tests()
  } catch (err) {
    console.error('FATAL:', err)
    fail++
  } finally {
    await teardown()
    await prisma.$disconnect()
    console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
    if (fail > 0) process.exit(1)
  }
})()
