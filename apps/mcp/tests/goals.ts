/**
 * Integration tests for the goal MCP tools.
 *
 * Mirrors the JWKS mock + Express app pattern in tests/tools.ts. Seeds a
 * fixture user, movement, and named workout via Prisma, then drives each
 * goal tool through POST /mcp and asserts the response shape.
 *
 * Run: cd apps/mcp && npx dotenv-cli -e ../../.env -- npx tsx tests/goals.ts
 */

import http from 'node:http'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { prisma } from '@wodalytics/db'
import { createApp } from '../src/app.js'
import { resetJwksCache } from '../src/auth/keycloak.js'

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

// ─── JWKS mock + JWT helpers ──────────────────────────────────────────────────

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

let _callId = 100

async function callTool(
  baseUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string; parsed: unknown }> {
  const id = ++_callId
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })
  const text = await res.text().catch(() => '')
  let parsedBody: unknown
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    parsedBody = parseSseData(text)
  } else {
    try { parsedBody = JSON.parse(text) } catch { parsedBody = text }
  }
  const rpcBody = parsedBody as Record<string, unknown>
  const result = rpcBody.result as Record<string, unknown> | undefined
  const error = rpcBody.error as Record<string, unknown> | undefined

  if (error) {
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

const SUFFIX = `mcpgoals${Date.now()}`

interface Fixtures {
  memberUserId: string
  otherUserId: string
  movementId: string
  namedWorkoutId: string
}

async function seedFixtures(): Promise<Fixtures> {
  const member = await prisma.user.create({
    data: { email: `goalmember.${SUFFIX}@test.invalid` },
  })
  const other = await prisma.user.create({
    data: { email: `goalother.${SUFFIX}@test.invalid` },
  })
  const movement = await prisma.movement.create({
    data: {
      name: `MCP Back Squat ${SUFFIX}`,
      status: 'ACTIVE',
      category: 'STRENGTH',
      prTypes: ['LOAD'],
    },
  })
  const nw = await prisma.namedWorkout.create({
    data: { name: `MCP Fran ${SUFFIX}`, category: 'GIRL_WOD' },
  })
  return {
    memberUserId: member.id,
    otherUserId: other.id,
    movementId: movement.id,
    namedWorkoutId: nw.id,
  }
}

async function cleanupFixtures(f: Fixtures): Promise<void> {
  await prisma.goal.deleteMany({ where: { userId: { in: [f.memberUserId, f.otherUserId] } } })
  await prisma.namedWorkout.deleteMany({ where: { id: f.namedWorkoutId } })
  await prisma.movement.deleteMany({ where: { id: f.movementId } })
  await prisma.user.deleteMany({ where: { id: { in: [f.memberUserId, f.otherUserId] } } })
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
  const memberToken = await mintToken(f.memberUserId, mockUrl)
  const otherToken = await mintToken(f.otherUserId, mockUrl)

  // Captured between tests so later tests can reference goals created earlier.
  let prTargetGoalId = ''
  let frequencyGoalId = ''
  let habitGoalId = ''

  try {
    // ── create_pr_target_goal ─────────────────────────────────────────────────

    console.log('\n=== T1: create_pr_target_goal — LOAD movement ===')
    {
      const r = await callTool(BASE, memberToken, 'create_pr_target_goal', {
        title: 'Back Squat 1RM 315 lb',
        movementId: f.movementId,
        targetPrType: 'LOAD',
        targetValue: 315,
        targetLoadUnit: 'LB',
        targetRepCount: 1,
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { id: string; type: string; status: string; targetValue: number; progress: { type: string; isComplete: boolean } } | null
      checkTrue('has id', typeof goal?.id === 'string')
      check('type=PR_TARGET', 'PR_TARGET', goal?.type)
      check('status=ACTIVE', 'ACTIVE', goal?.status)
      check('targetValue echoed', 315, goal?.targetValue)
      check('progress.type=PR_TARGET', 'PR_TARGET', goal?.progress.type)
      check('progress.isComplete=false', false, goal?.progress.isComplete)
      prTargetGoalId = goal?.id ?? ''
    }

    console.log('\n=== T2: create_pr_target_goal — TIME benchmark ===')
    {
      const r = await callTool(BASE, memberToken, 'create_pr_target_goal', {
        title: 'Fran sub-4:00',
        namedWorkoutId: f.namedWorkoutId,
        targetPrType: 'TIME',
        targetValue: 240,
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { namedWorkoutId: string; targetPrType: string } | null
      check('namedWorkoutId set', f.namedWorkoutId, goal?.namedWorkoutId)
      check('targetPrType=TIME', 'TIME', goal?.targetPrType)
    }

    console.log('\n=== T3: create_pr_target_goal — neither movement nor benchmark → error ===')
    {
      const r = await callTool(BASE, memberToken, 'create_pr_target_goal', {
        title: 'No target',
        targetPrType: 'LOAD',
        targetValue: 100,
        targetLoadUnit: 'LB',
        targetRepCount: 1,
      })
      checkTrue('isError', r.isError)
      checkTrue('mentions XOR', r.text.toLowerCase().includes('movementid or namedworkoutid'))
    }

    console.log('\n=== T4: create_pr_target_goal — both movement AND benchmark → error ===')
    {
      const r = await callTool(BASE, memberToken, 'create_pr_target_goal', {
        title: 'Conflict',
        movementId: f.movementId,
        namedWorkoutId: f.namedWorkoutId,
        targetPrType: 'LOAD',
        targetValue: 100,
        targetLoadUnit: 'LB',
        targetRepCount: 1,
      })
      checkTrue('isError', r.isError)
    }

    console.log('\n=== T5: create_pr_target_goal — LOAD without unit → error ===')
    {
      const r = await callTool(BASE, memberToken, 'create_pr_target_goal', {
        title: 'LOAD no unit',
        movementId: f.movementId,
        targetPrType: 'LOAD',
        targetValue: 200,
      })
      checkTrue('isError', r.isError)
      checkTrue('mentions targetLoadUnit', r.text.includes('targetLoadUnit'))
    }

    // ── create_frequency_goal ─────────────────────────────────────────────────

    console.log('\n=== T6: create_frequency_goal ===')
    {
      const r = await callTool(BASE, memberToken, 'create_frequency_goal', {
        title: '3 workouts/week × 4 weeks',
        frequencyPerWeek: 3,
        frequencyWeeks: 4,
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { id: string; type: string; frequencyPerWeek: number; progress: { type: string; workoutsRequired: number } } | null
      checkTrue('has id', typeof goal?.id === 'string')
      check('type=FREQUENCY', 'FREQUENCY', goal?.type)
      check('frequencyPerWeek=3', 3, goal?.frequencyPerWeek)
      check('progress.workoutsRequired=12', 12, goal?.progress.workoutsRequired)
      frequencyGoalId = goal?.id ?? ''
    }

    // ── create_habit_goal ─────────────────────────────────────────────────────

    console.log('\n=== T7: create_habit_goal ===')
    {
      const r = await callTool(BASE, memberToken, 'create_habit_goal', {
        title: 'Avoid added sugars',
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { id: string; type: string; movementId: string | null; progress: { type: string } } | null
      check('type=HABIT', 'HABIT', goal?.type)
      check('movementId null', null, goal?.movementId)
      check('progress.type=HABIT', 'HABIT', goal?.progress.type)
      habitGoalId = goal?.id ?? ''
    }

    // ── list_my_goals ─────────────────────────────────────────────────────────

    console.log('\n=== T8: list_my_goals — returns all created ===')
    {
      const r = await callTool(BASE, memberToken, 'list_my_goals', {})
      check('not error', false, r.isError)
      const goals = r.parsed as Array<{ id: string }> | null
      checkTrue('returns array', Array.isArray(goals))
      check('returns at least 4', true, (goals?.length ?? 0) >= 4)
      checkTrue('includes habit goal', goals?.some((g) => g.id === habitGoalId) === true)
    }

    console.log('\n=== T9: list_my_goals?status=ACTIVE ===')
    {
      const r = await callTool(BASE, memberToken, 'list_my_goals', { status: 'ACTIVE' })
      check('not error', false, r.isError)
      const goals = r.parsed as Array<{ status: string }> | null
      checkTrue('every entry is ACTIVE', goals?.every((g) => g.status === 'ACTIVE') === true)
    }

    // ── get_my_goal ───────────────────────────────────────────────────────────

    console.log('\n=== T10: get_my_goal — own goal ===')
    {
      const r = await callTool(BASE, memberToken, 'get_my_goal', { goalId: prTargetGoalId })
      check('not error', false, r.isError)
      const goal = r.parsed as { id: string; title: string } | null
      check('id matches', prTargetGoalId, goal?.id)
    }

    console.log('\n=== T11: get_my_goal — other user\'s goal → error ===')
    {
      const r = await callTool(BASE, otherToken, 'get_my_goal', { goalId: prTargetGoalId })
      checkTrue('isError', r.isError)
      checkTrue('mentions ownership or not found', r.text.toLowerCase().includes('own') || r.text.toLowerCase().includes('not found'))
    }

    console.log('\n=== T12: get_my_goal — nonexistent → error ===')
    {
      const r = await callTool(BASE, memberToken, 'get_my_goal', { goalId: 'does-not-exist' })
      checkTrue('isError', r.isError)
    }

    // ── update_my_goal ────────────────────────────────────────────────────────

    console.log('\n=== T13: update_my_goal — rename + complete habit ===')
    {
      const r = await callTool(BASE, memberToken, 'update_my_goal', {
        goalId: habitGoalId,
        title: 'No added sugars (renamed)',
        status: 'COMPLETED',
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { title: string; status: string; completedAt: string | null } | null
      check('title updated', 'No added sugars (renamed)', goal?.title)
      check('status=COMPLETED', 'COMPLETED', goal?.status)
      checkTrue('completedAt set', typeof goal?.completedAt === 'string')
    }

    console.log('\n=== T14: update_my_goal — revert COMPLETED to ACTIVE clears completedAt ===')
    {
      const r = await callTool(BASE, memberToken, 'update_my_goal', {
        goalId: habitGoalId,
        status: 'ACTIVE',
      })
      check('not error', false, r.isError)
      const goal = r.parsed as { status: string; completedAt: string | null } | null
      check('status=ACTIVE', 'ACTIVE', goal?.status)
      check('completedAt cleared', null, goal?.completedAt)
    }

    console.log('\n=== T15: update_my_goal — other user → error ===')
    {
      const r = await callTool(BASE, otherToken, 'update_my_goal', {
        goalId: habitGoalId,
        title: 'hijack',
      })
      checkTrue('isError', r.isError)
    }

    // ── delete_my_goal ────────────────────────────────────────────────────────

    console.log('\n=== T16: delete_my_goal — other user → error ===')
    {
      const r = await callTool(BASE, otherToken, 'delete_my_goal', { goalId: frequencyGoalId })
      checkTrue('isError', r.isError)
    }

    console.log('\n=== T17: delete_my_goal — own goal ===')
    {
      const r = await callTool(BASE, memberToken, 'delete_my_goal', { goalId: frequencyGoalId })
      check('not error', false, r.isError)
      const result = r.parsed as { deleted: boolean; goalId: string } | null
      check('deleted=true', true, result?.deleted)
      check('goalId echoed', frequencyGoalId, result?.goalId)
    }

    console.log('\n=== T18: delete_my_goal — already-deleted → error ===')
    {
      const r = await callTool(BASE, memberToken, 'delete_my_goal', { goalId: frequencyGoalId })
      checkTrue('isError', r.isError)
    }
  } finally {
    await cleanupFixtures(f)
    await prisma.$disconnect()
    mcpServer.close()
    mockServer.close()
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
