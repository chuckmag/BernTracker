/**
 * Integration tests for all 8 MCP tools (#315).
 *
 * Spins up an in-process JWKS mock and MCP Express app (same pattern as
 * scaffold.ts). Seeds minimal DB fixtures via Prisma, invokes each tool
 * via POST /mcp, and asserts the response. All fixtures are cleaned up in
 * the finally block regardless of test outcome.
 *
 * Covers:
 *   T1:  list_workouts — gym member sees gym program workouts
 *   T2:  list_workouts — programId filter scopes to that program
 *   T3:  list_workouts — date range filter (scheduledAfter)
 *   T4:  get_workout — accessible workout returns full detail with movements
 *   T5:  get_workout — inaccessible workout returns error
 *   T6:  get_today_workout — today's gym WOD returned for gym member
 *   T7:  get_today_workout — returns null for user with no gym membership
 *   T8:  get_programs — gym member sees their gym program
 *   T9:  create_workout — creates workout in user's personal program
 *   T10: create_workout — unknown movement name returns error with candidates
 *   T11: get_workout_results — gym program workout returns leaderboard
 *   T12: get_workout_results — private personal program workout returns error
 *   T13: get_my_results — returns caller's own results
 *   T14: get_my_results — filtered by workoutId
 *   T15: log_result — invalid value shape returns validation error
 *   T16: log_result — inaccessible workout returns error
 *   T17: log_result — valid FOR_TIME result logged successfully
 *   T18: log_result — duplicate result returns error
 *
 * Run: cd apps/mcp && npx dotenv-cli -e ../../.env -- npx tsx tests/tools.ts
 */

import http from 'node:http'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { prisma } from '@wodalytics/db'
import { createApp } from '../src/app.js'
import { resetJwksCache } from '../src/auth/keycloak.js'

// ─── Counters ─────────────────────────────────────────────────────────────────

let pass = 0
let fail = 0

function check(label: string, expected: unknown, actual: unknown): void {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

function checkTrue(label: string, value: boolean): void {
  if (value) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [was false]`)
    fail++
  }
}

// ─── Mock Keycloak + JWT helpers ──────────────────────────────────────────────

const { privateKey, publicKey } = await generateKeyPair('RS256')
const jwkPublic = await exportJWK(publicKey)
jwkPublic.kid = 'test-key-1'
jwkPublic.alg = 'RS256'
jwkPublic.use = 'sig'

async function mintToken(userId: string, issuer: string): Promise<string> {
  return new SignJWT({ wodalytics_user_id: userId, wodalytics_role: 'MEMBER' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
}

function startMockKeycloak(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.includes('/protocol/openid-connect/certs')) {
        res.end(JSON.stringify({ keys: [jwkPublic] }))
      } else {
        res.statusCode = 404
        res.end('{}')
      }
    })
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port
      resolve({ server, url: `http://localhost:${port}` })
    })
  })
}

// ─── HTTP + SSE helpers ───────────────────────────────────────────────────────

function parseSseData(text: string): unknown {
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      try { return JSON.parse(line.slice(5).trim()) } catch { /* skip */ }
    }
  }
  return text
}

async function httpReq(
  baseUrl: string,
  token: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text().catch(() => '')
  let parsed: unknown
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    parsed = parseSseData(text)
  } else {
    try { parsed = JSON.parse(text) } catch { parsed = text }
  }
  return { status: res.status, body: parsed }
}

// ─── Tool call helper ─────────────────────────────────────────────────────────

let _callId = 100

async function callTool(
  baseUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string; parsed: unknown }> {
  const id = ++_callId
  const { body } = await httpReq(baseUrl, token, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  })
  const rpcBody = body as Record<string, unknown>
  const result = rpcBody.result as Record<string, unknown> | undefined
  const error = rpcBody.error as Record<string, unknown> | undefined

  if (error) {
    // RPC-level error (e.g. not initialized) — wrap as tool error so tests
    // can distinguish from a successful tool response.
    return { isError: true, text: String(error.message ?? JSON.stringify(error)), parsed: null }
  }

  const content = result?.content as Array<{ type: string; text: string }> | undefined
  const firstText = content?.[0]?.text ?? ''
  let parsed: unknown = null
  try { parsed = JSON.parse(firstText) } catch { /* not JSON */ }

  return {
    isError: result?.isError === true,
    text: firstText,
    parsed,
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SUFFIX = `mcptools${Date.now()}`

interface Fixtures {
  gymUserId: string
  outsiderUserId: string
  gymId: string
  gymProgramId: string
  personalProgramId: string
  testMovementId: string
  testMovementName: string
  todayWorkoutId: string
  pastWorkoutId: string
  personalWorkoutId: string
  existingResultId: string
}

async function seedFixtures(): Promise<Fixtures> {
  // Users
  const gymUser = await prisma.user.create({
    data: { email: `gymuser.${SUFFIX}@test.invalid`, name: `Gym User ${SUFFIX}` },
  })
  const outsider = await prisma.user.create({
    data: { email: `outsider.${SUFFIX}@test.invalid`, name: `Outsider ${SUFFIX}` },
  })

  // Gym
  const gym = await prisma.gym.create({
    data: { name: `Test Gym ${SUFFIX}`, slug: `test-gym-${SUFFIX}` },
  })

  // Gym membership
  await prisma.userGym.create({
    data: { userId: gymUser.id, gymId: gym.id, role: 'MEMBER' },
  })

  // Gym program (default for the gym)
  const gymProgram = await prisma.program.create({
    data: {
      name: `Gym Program ${SUFFIX}`,
      startDate: new Date('2024-01-01'),
      visibility: 'PUBLIC',
    },
  })
  await prisma.gymProgram.create({
    data: { gymId: gym.id, programId: gymProgram.id, isDefault: true },
  })

  // Personal program (pre-seeded so create_workout T9 reuses it)
  const personalProgram = await prisma.program.create({
    data: {
      name: `Personal Program ${SUFFIX}`,
      startDate: new Date('2024-01-01'),
      visibility: 'PRIVATE',
      ownerUserId: gymUser.id,
    },
  })

  // Movement
  const movement = await prisma.movement.create({
    data: {
      name: `MCP Squat ${SUFFIX}`,
      status: 'ACTIVE',
      category: 'STRENGTH',
      aliases: [],
    },
  })

  // Today's workout (UTC day boundary)
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayWorkout = await prisma.workout.create({
    data: {
      programId: gymProgram.id,
      title: `Today WOD ${SUFFIX}`,
      description: 'Today test workout',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: dayStart,
    },
  })

  // Past workout with a movement prescription
  const yesterday = new Date(dayStart)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const pastWorkout = await prisma.workout.create({
    data: {
      programId: gymProgram.id,
      title: `Past WOD ${SUFFIX}`,
      description: 'Past test workout',
      type: 'STRENGTH',
      status: 'PUBLISHED',
      scheduledAt: yesterday,
      workoutMovements: {
        create: [{
          movementId: movement.id,
          displayOrder: 0,
          sets: 5,
          reps: '5',
          tracksLoad: true,
        }],
      },
    },
  })

  // Personal program workout (for private-program results test)
  const personalWorkout = await prisma.workout.create({
    data: {
      programId: personalProgram.id,
      title: `Personal WOD ${SUFFIX}`,
      description: 'Private workout',
      type: 'STRENGTH',
      status: 'PUBLISHED',
      scheduledAt: yesterday,
    },
  })

  // gymUser's result on pastWorkout
  const existingResult = await prisma.result.create({
    data: {
      userId: gymUser.id,
      workoutId: pastWorkout.id,
      level: 'RX',
      workoutGender: 'OPEN',
      value: { score: { kind: 'LOAD', load: 225, unit: 'LB' } },
      primaryScoreKind: 'LOAD',
      primaryScoreValue: 225,
    },
  })

  return {
    gymUserId: gymUser.id,
    outsiderUserId: outsider.id,
    gymId: gym.id,
    gymProgramId: gymProgram.id,
    personalProgramId: personalProgram.id,
    testMovementId: movement.id,
    testMovementName: movement.name,
    todayWorkoutId: todayWorkout.id,
    pastWorkoutId: pastWorkout.id,
    personalWorkoutId: personalWorkout.id,
    existingResultId: existingResult.id,
  }
}

async function cleanupFixtures(f: Fixtures): Promise<void> {
  // Results (before workouts)
  await prisma.result.deleteMany({
    where: { workoutId: { in: [f.pastWorkoutId, f.todayWorkoutId, f.personalWorkoutId] } },
  })
  // Also delete any results logged by tests on any of the user's workouts
  await prisma.result.deleteMany({ where: { userId: f.gymUserId } })

  // WorkoutMovements (before movement deletion)
  await prisma.workoutMovement.deleteMany({
    where: { workoutId: { in: [f.pastWorkoutId, f.todayWorkoutId] } },
  })

  // Personal program workouts created by create_workout test (beyond the seeded one)
  await prisma.workoutMovement.deleteMany({
    where: { workout: { programId: f.personalProgramId } },
  })
  await prisma.workout.deleteMany({ where: { programId: f.personalProgramId } })

  // Seeded test workouts
  await prisma.workout.deleteMany({
    where: { id: { in: [f.pastWorkoutId, f.todayWorkoutId, f.personalWorkoutId] } },
  })

  // Program → gym link (before gym deletion)
  await prisma.gymProgram.deleteMany({
    where: { gymId: f.gymId, programId: f.gymProgramId },
  })

  // Programs
  await prisma.program.deleteMany({
    where: { id: { in: [f.gymProgramId, f.personalProgramId] } },
  })

  // Movement (WorkoutMovements already deleted above)
  await prisma.movement.deleteMany({ where: { id: f.testMovementId } })

  // Gym (cascades UserGym rows)
  await prisma.gym.deleteMany({ where: { id: f.gymId } })

  // Users (cascades remaining UserGym, UserProgram, Result rows)
  await prisma.user.deleteMany({
    where: { id: { in: [f.gymUserId, f.outsiderUserId] } },
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const { server: mockServer, url: mockUrl } = await startMockKeycloak()
  process.env.KEYCLOAK_ISSUER_URL = mockUrl
  resetJwksCache()

  const app = createApp()
  const mcpServer = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const BASE = `http://localhost:${(mcpServer.address() as { port: number }).port}`

  const f = await seedFixtures()
  const gymToken = await mintToken(f.gymUserId, mockUrl)
  const outsiderToken = await mintToken(f.outsiderUserId, mockUrl)

  try {
    // ── list_workouts ──────────────────────────────────────────────────────────

    console.log('\n=== T1: list_workouts — gym member sees gym program workouts ===')
    {
      const r = await callTool(BASE, gymToken, 'list_workouts', {})
      check('not error', false, r.isError)
      const workouts = r.parsed as Array<{ id: string }> | null
      checkTrue('returns array', Array.isArray(workouts))
      checkTrue(
        'contains todayWorkout',
        (workouts ?? []).some((w) => w.id === f.todayWorkoutId),
      )
      checkTrue(
        'contains pastWorkout',
        (workouts ?? []).some((w) => w.id === f.pastWorkoutId),
      )
    }

    console.log('\n=== T2: list_workouts — programId filter ===')
    {
      const r = await callTool(BASE, gymToken, 'list_workouts', { programId: f.gymProgramId })
      check('not error', false, r.isError)
      const workouts = r.parsed as Array<{ programId: string }> | null
      checkTrue('returns array', Array.isArray(workouts))
      checkTrue(
        'all workouts match programId',
        (workouts ?? []).every((w) => w.programId === f.gymProgramId),
      )
    }

    console.log('\n=== T3: list_workouts — scheduledAfter date filter ===')
    {
      const now = new Date()
      // scheduledAfter = start of today → should include todayWorkout, exclude pastWorkout
      const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
      const r = await callTool(BASE, gymToken, 'list_workouts', { scheduledAfter: todayIso })
      check('not error', false, r.isError)
      const workouts = r.parsed as Array<{ id: string }> | null
      checkTrue(
        'todayWorkout in result',
        (workouts ?? []).some((w) => w.id === f.todayWorkoutId),
      )
      checkTrue(
        'pastWorkout excluded',
        !(workouts ?? []).some((w) => w.id === f.pastWorkoutId),
      )
    }

    // ── get_workout ────────────────────────────────────────────────────────────

    console.log('\n=== T4: get_workout — accessible workout with movements ===')
    {
      const r = await callTool(BASE, gymToken, 'get_workout', { workoutId: f.pastWorkoutId })
      check('not error', false, r.isError)
      const workout = r.parsed as Record<string, unknown> | null
      check('id matches', f.pastWorkoutId, workout?.id)
      const movements = workout?.movements as unknown[] | undefined
      checkTrue('has movements array', Array.isArray(movements))
      checkTrue('at least one movement', (movements ?? []).length > 0)
    }

    console.log('\n=== T5: get_workout — inaccessible workout (outsider) ===')
    {
      // outsiderUser has no gym membership so cannot access gym program workouts
      const r = await callTool(BASE, outsiderToken, 'get_workout', { workoutId: f.pastWorkoutId })
      check('isError', true, r.isError)
    }

    // ── get_today_workout ──────────────────────────────────────────────────────

    console.log('\n=== T6: get_today_workout — gym member returns today\'s WOD ===')
    {
      const r = await callTool(BASE, gymToken, 'get_today_workout', {})
      check('not error', false, r.isError)
      const workout = r.parsed as Record<string, unknown> | null
      check('id matches todayWorkout', f.todayWorkoutId, workout?.id)
    }

    console.log('\n=== T7: get_today_workout — user with no gym returns null ===')
    {
      const r = await callTool(BASE, outsiderToken, 'get_today_workout', {})
      check('not error', false, r.isError)
      check('result is null', 'null', JSON.stringify(r.parsed))
    }

    // ── get_programs ───────────────────────────────────────────────────────────

    console.log('\n=== T8: get_programs — gym member sees their gym program ===')
    {
      const r = await callTool(BASE, gymToken, 'get_programs', {})
      check('not error', false, r.isError)
      const programs = r.parsed as Array<{ id: string; isPersonal: boolean }> | null
      checkTrue('returns array', Array.isArray(programs))
      checkTrue(
        'gym program present',
        (programs ?? []).some((p) => p.id === f.gymProgramId),
      )
    }

    // ── create_workout ─────────────────────────────────────────────────────────

    console.log('\n=== T9: create_workout — creates workout in personal program ===')
    {
      const r = await callTool(BASE, gymToken, 'create_workout', {
        title: `Created WOD ${SUFFIX}`,
        type: 'STRENGTH',
        description: 'MCP-created workout',
        movements: [
          {
            movementName: f.testMovementName, // exact match
            displayOrder: 0,
            sets: 3,
            reps: '5',
          },
        ],
      })
      check('not error', false, r.isError)
      const workout = r.parsed as Record<string, unknown> | null
      checkTrue('has id', typeof workout?.id === 'string')
      check('programId is personal program', f.personalProgramId, workout?.programId)
    }

    console.log('\n=== T10: create_workout — unknown movement returns candidates error ===')
    {
      const r = await callTool(BASE, gymToken, 'create_workout', {
        title: 'Should Fail',
        type: 'STRENGTH',
        movements: [{ movementName: 'xyzzy-nonexistent-mvmt-99999', displayOrder: 0 }],
      })
      check('isError', true, r.isError)
      checkTrue('text mentions "Unknown movement"', r.text.includes('Unknown movement'))
    }

    // ── get_workout_results ────────────────────────────────────────────────────

    console.log('\n=== T11: get_workout_results — gym program workout returns leaderboard ===')
    {
      const r = await callTool(BASE, gymToken, 'get_workout_results', {
        workoutId: f.pastWorkoutId,
      })
      check('not error', false, r.isError)
      const leaderboard = r.parsed as Array<{ rank: number; displayName: string }> | null
      checkTrue('returns array', Array.isArray(leaderboard))
      check('has at least one entry', true, (leaderboard ?? []).length >= 1)
      check('first entry rank is 1', 1, leaderboard?.[0]?.rank)
    }

    console.log('\n=== T12: get_workout_results — private personal program workout errors ===')
    {
      const r = await callTool(BASE, gymToken, 'get_workout_results', {
        workoutId: f.personalWorkoutId,
      })
      check('isError', true, r.isError)
      checkTrue('text mentions private', r.text.toLowerCase().includes('private'))
    }

    // ── get_my_results ─────────────────────────────────────────────────────────

    console.log('\n=== T13: get_my_results — returns caller\'s own results ===')
    {
      const r = await callTool(BASE, gymToken, 'get_my_results', {})
      check('not error', false, r.isError)
      const results = r.parsed as Array<{ id: string; workoutId: string }> | null
      checkTrue('returns array', Array.isArray(results))
      checkTrue(
        'contains seeded result',
        (results ?? []).some((res) => res.id === f.existingResultId),
      )
    }

    console.log('\n=== T14: get_my_results — filtered by workoutId ===')
    {
      const r = await callTool(BASE, gymToken, 'get_my_results', {
        workoutId: f.pastWorkoutId,
      })
      check('not error', false, r.isError)
      const results = r.parsed as Array<{ workoutId: string }> | null
      checkTrue('returns array', Array.isArray(results))
      checkTrue(
        'all results match workoutId',
        (results ?? []).every((res) => res.workoutId === f.pastWorkoutId),
      )
    }

    // ── log_result ─────────────────────────────────────────────────────────────

    console.log('\n=== T15: log_result — invalid value shape returns validation error ===')
    {
      // Missing both score and movementResults — fails ResultValueSchema.refine()
      const r = await callTool(BASE, gymToken, 'log_result', {
        workoutId: f.todayWorkoutId,
        level: 'RX',
        workoutGender: 'OPEN',
        value: {},
      })
      check('isError', true, r.isError)
      checkTrue('text mentions invalid result', r.text.toLowerCase().includes('invalid result value'))
    }

    console.log('\n=== T16: log_result — inaccessible workout returns error ===')
    {
      // outsiderUser cannot access gym program workouts
      const r = await callTool(BASE, outsiderToken, 'log_result', {
        workoutId: f.todayWorkoutId,
        level: 'RX',
        workoutGender: 'OPEN',
        value: { score: { kind: 'TIME', seconds: 600, cappedOut: false } },
      })
      check('isError', true, r.isError)
    }

    console.log('\n=== T17: log_result — valid FOR_TIME result logged successfully ===')
    {
      const r = await callTool(BASE, gymToken, 'log_result', {
        workoutId: f.todayWorkoutId,
        level: 'RX',
        workoutGender: 'OPEN',
        value: { score: { kind: 'TIME', seconds: 600, cappedOut: false } },
        notes: 'Test run',
      })
      check('not error', false, r.isError)
      const result = r.parsed as Record<string, unknown> | null
      checkTrue('has id', typeof result?.id === 'string')
      check('workoutId matches', f.todayWorkoutId, result?.workoutId)
      check('level matches', 'RX', result?.level)
    }

    console.log('\n=== T18: log_result — duplicate result returns error ===')
    {
      // gymUser already logged todayWorkoutId in T17
      const r = await callTool(BASE, gymToken, 'log_result', {
        workoutId: f.todayWorkoutId,
        level: 'SCALED',
        workoutGender: 'OPEN',
        value: { score: { kind: 'TIME', seconds: 999, cappedOut: false } },
      })
      check('isError', true, r.isError)
      checkTrue('text mentions already have', r.text.toLowerCase().includes('already'))
    }
  } finally {
    await cleanupFixtures(f).catch((err) => console.error('Cleanup error:', err))
    await new Promise<void>((resolve) => mcpServer.close(() => resolve()))
    await new Promise<void>((resolve) => mockServer.close(() => resolve()))
    await prisma.$disconnect()
  }

  console.log(`\n${pass + fail} checks — ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

run().catch((err) => {
  console.error('Test runner error:', err)
  process.exit(1)
})
