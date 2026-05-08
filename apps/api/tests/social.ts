/**
 * Integration tests for social features: reactions + comments on results.
 *
 * Requires: API running (default localhost:3000, or API_URL env var), DB via DATABASE_URL.
 * Run: cd apps/api && npx dotenv-cli -e ../../.env -- npx tsx tests/social.ts
 */

import { prisma } from '@wodalytics/db'
import { signTokenPair } from '../src/lib/jwt.js'

const BASE = process.env.API_URL ?? 'http://localhost:3000/api'
let pass = 0
let fail = 0

// ─── Helpers ──────────────────────────────────────────────────────────────────

function check(label: string, expected: unknown, actual: unknown) {
  if (String(expected) === String(actual)) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  [expected=${expected} actual=${actual}]`)
    fail++
  }
}

async function api(method: string, path: string, token?: string, body?: unknown) {
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
  return { status: res.status, body: json as Record<string, unknown> & unknown[] }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
let userAId = ''
let userBId = ''
let userAToken = ''
let userBToken = ''
let resultId = ''
let commentId = ''
let replyId = ''

async function setup() {
  console.log('\n=== Setup ===')

  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `at-social-a-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `at-social-b-${TS}@test.com` } }),
  ])
  userAId = userA.id
  userBId = userB.id
  userAToken = signTokenPair(userAId, 'MEMBER').accessToken
  userBToken = signTokenPair(userBId, 'MEMBER').accessToken

  const workout = await prisma.workout.create({
    data: {
      title: `AT Social WOD ${TS}`,
      description: 'Social feature integration test',
      type: 'FOR_TIME',
      scheduledAt: new Date('2026-05-08T10:00:00Z'),
    },
  })

  const result = await prisma.result.create({
    data: {
      userId: userAId,
      workoutId: workout.id,
      level: 'RX',
      workoutGender: 'OPEN',
      value: { totalSeconds: 600 },
    },
  })
  resultId = result.id
  console.log(`  seeded resultId=${resultId}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testResultReactions() {
  console.log('\n--- Result reactions ---')

  // 401 without auth
  const unauth = await api('POST', `/results/${resultId}/reactions`, undefined, { emoji: '👍' })
  check('POST /results/:id/reactions → 401 without auth', 401, unauth.status)

  // 400 missing emoji
  const noEmoji = await api('POST', `/results/${resultId}/reactions`, userAToken, {})
  check('POST /results/:id/reactions → 400 missing emoji', 400, noEmoji.status)

  // 400 disallowed emoji
  const bad = await api('POST', `/results/${resultId}/reactions`, userAToken, { emoji: '🦄' })
  check('POST /results/:id/reactions → 400 disallowed emoji', 400, bad.status)

  // 201 add reaction
  const add = await api('POST', `/results/${resultId}/reactions`, userAToken, { emoji: '👍' })
  check('POST /results/:id/reactions → 201 created', 201, add.status)
  check('reaction has resultId', resultId, (add.body as Record<string, unknown>).resultId)

  // 409 duplicate
  const dup = await api('POST', `/results/${resultId}/reactions`, userAToken, { emoji: '👍' })
  check('POST /results/:id/reactions → 409 duplicate', 409, dup.status)

  // user B adds same emoji — allowed (different user)
  const addB = await api('POST', `/results/${resultId}/reactions`, userBToken, { emoji: '👍' })
  check('different user same emoji → 201', 201, addB.status)

  // 404 remove nonexistent
  const noReact = await api('DELETE', `/results/${resultId}/reactions/%F0%9F%94%A5`, userAToken)
  check('DELETE nonexistent reaction → 404', 404, noReact.status)

  // 204 remove own reaction
  const del = await api('DELETE', `/results/${resultId}/reactions/%F0%9F%91%8D`, userAToken)
  check('DELETE own reaction → 204', 204, del.status)

  // 404 on result that does not exist
  const noResult = await api('POST', `/results/nonexistent-id/reactions`, userAToken, { emoji: '👍' })
  check('POST reaction on nonexistent result → 404', 404, noResult.status)
}

async function testCommentCRUD() {
  console.log('\n--- Comment CRUD ---')

  // 401 without auth
  const unauth = await api('GET', `/results/${resultId}/comments`)
  check('GET comments → 401 without auth', 401, unauth.status)

  // 400 missing body
  const noBody = await api('POST', `/results/${resultId}/comments`, userAToken, {})
  check('POST comment → 400 missing body', 400, noBody.status)

  // 201 create top-level comment
  const create = await api('POST', `/results/${resultId}/comments`, userAToken, { body: 'Great job!' })
  check('POST comment → 201', 201, create.status)
  commentId = (create.body as Record<string, unknown>).id as string
  check('comment has resultId', resultId, (create.body as Record<string, unknown>).resultId)
  check('comment parentId is null', 'null', String((create.body as Record<string, unknown>).parentId))

  // GET list — comment appears
  const list = await api('GET', `/results/${resultId}/comments`, userAToken)
  check('GET comments → 200', 200, list.status)
  const comments = (list.body as Record<string, unknown>).comments as unknown[]
  check('list has 1 top-level comment', 1, comments?.length)

  // PATCH edit own comment
  const edit = await api('PATCH', `/comments/${commentId}`, userAToken, { body: 'Updated!' })
  check('PATCH own comment → 200', 200, edit.status)
  check('body updated', 'Updated!', (edit.body as Record<string, unknown>).body)

  // 403 edit another user's comment
  const forbidEdit = await api('PATCH', `/comments/${commentId}`, userBToken, { body: 'Hijack' })
  check('PATCH another user comment → 403', 403, forbidEdit.status)
}

async function testReplies() {
  console.log('\n--- Replies ---')

  // 201 create reply
  const reply = await api('POST', `/comments/${commentId}/replies`, userBToken, { body: 'Thanks!' })
  check('POST reply → 201', 201, reply.status)
  replyId = (reply.body as Record<string, unknown>).id as string
  check('reply has parentId', commentId, (reply.body as Record<string, unknown>).parentId)

  // GET list — reply appears inline
  const list = await api('GET', `/results/${resultId}/comments`, userAToken)
  const c = ((list.body as Record<string, unknown>).comments as Record<string, unknown>[])?.[0]
  check('top-level comment has 1 reply', 1, (c?.replies as unknown[])?.length)
  check('reply replyCount = 0 (no nested)', 0, (c?.replies as Record<string, unknown>[])?.[0]?.replyCount)
}

async function testCommentReactions() {
  console.log('\n--- Comment reactions ---')

  // 201 react to comment
  const add = await api('POST', `/comments/${commentId}/reactions`, userBToken, { emoji: '🔥' })
  check('POST comment reaction → 201', 201, add.status)

  // 409 duplicate
  const dup = await api('POST', `/comments/${commentId}/reactions`, userBToken, { emoji: '🔥' })
  check('POST duplicate comment reaction → 409', 409, dup.status)

  // reaction appears in GET list
  const list = await api('GET', `/results/${resultId}/comments`, userBToken)
  const c = ((list.body as Record<string, unknown>).comments as Record<string, unknown>[])?.[0]
  const reactions = c?.reactions as { emoji: string; count: number; userReacted: boolean }[]
  const fire = reactions?.find((r) => r.emoji === '🔥')
  check('fire reaction count = 1', 1, fire?.count)
  check('userReacted = true for caller (userB)', 'true', String(fire?.userReacted))

  // userReacted = false for non-reactor (userA)
  const listA = await api('GET', `/results/${resultId}/comments`, userAToken)
  const cA = ((listA.body as Record<string, unknown>).comments as Record<string, unknown>[])?.[0]
  const reactionsA = cA?.reactions as { emoji: string; count: number; userReacted: boolean }[]
  const fireA = reactionsA?.find((r) => r.emoji === '🔥')
  check('userReacted = false for non-reactor', 'false', String(fireA?.userReacted))

  // 204 remove own comment reaction
  const del = await api('DELETE', `/comments/${commentId}/reactions/%F0%9F%94%A5`, userBToken)
  check('DELETE comment reaction → 204', 204, del.status)
}

async function testSoftDelete() {
  console.log('\n--- Soft delete ---')

  // 403 soft-delete another user's comment
  const forbid = await api('DELETE', `/comments/${commentId}`, userBToken)
  check('DELETE another user comment → 403', 403, forbid.status)

  // 204 soft-delete own comment
  const del = await api('DELETE', `/comments/${commentId}`, userAToken)
  check('DELETE own comment → 204', 204, del.status)

  // idempotent — second delete returns 204 (already deleted)
  const del2 = await api('DELETE', `/comments/${commentId}`, userAToken)
  check('DELETE already-deleted comment → 204 (idempotent)', 204, del2.status)

  // GET list — deleted comment has null body/user, reply still present
  const list = await api('GET', `/results/${resultId}/comments`, userAToken)
  const c = ((list.body as Record<string, unknown>).comments as Record<string, unknown>[])?.[0]
  check('soft-deleted body is null', 'null', String(c?.body))
  check('soft-deleted user is null', 'null', String(c?.user))
  check('deletedAt is set', true, Boolean(c?.deletedAt))
  check('reply still present after parent soft-delete', 1, (c?.replies as unknown[])?.length)

  // 422 reply to soft-deleted comment
  const replyBlocked = await api('POST', `/comments/${commentId}/replies`, userBToken, { body: 'Can I?' })
  check('POST reply to deleted comment → 422', 422, replyBlocked.status)

  // 422 edit soft-deleted comment
  const editBlocked = await api('PATCH', `/comments/${commentId}`, userAToken, { body: 'Can I?' })
  check('PATCH deleted comment → 422', 422, editBlocked.status)

  // 422 react to soft-deleted comment
  const reactBlocked = await api('POST', `/comments/${commentId}/reactions`, userAToken, { emoji: '👍' })
  check('POST reaction on deleted comment → 422', 422, reactBlocked.status)
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.reaction.deleteMany({ where: { result: { workout: { title: { contains: `AT Social WOD ${TS}` } } } } })
  await prisma.comment.deleteMany({ where: { result: { workout: { title: { contains: `AT Social WOD ${TS}` } } } } })
  await prisma.result.deleteMany({ where: { workout: { title: { contains: `AT Social WOD ${TS}` } } } })
  await prisma.workout.deleteMany({ where: { title: { contains: `AT Social WOD ${TS}` } } })
  await prisma.user.deleteMany({ where: { email: { in: [`at-social-a-${TS}@test.com`, `at-social-b-${TS}@test.com`] } } })
  console.log('  done')
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  await setup()
  try {
    await testResultReactions()
    await testCommentCRUD()
    await testReplies()
    await testCommentReactions()
    await testSoftDelete()
  } finally {
    await teardown()
    await prisma.$disconnect()
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
