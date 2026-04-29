/**
 * Integration tests for avatar upload (slice C of #120).
 *
 * Uses the LocalFsImageStorage backend so the test doesn't need AWS credentials.
 * Tests assert against the live API and verify both the response shape and the
 * persisted User.avatarUrl in the DB.
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible.
 * Run: cd apps/api && npx tsx tests/avatar.ts
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
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

const TS = Date.now()

let aliceId = '', aliceToken = ''
let bobId = '', bobToken = ''

async function setup() {
  console.log('\n=== Setup ===')
  const [alice, bob] = await Promise.all([
    prisma.user.create({ data: { email: `avatar-alice-${TS}@test.com`, name: 'Alice' } }),
    prisma.user.create({ data: { email: `avatar-bob-${TS}@test.com`, name: 'Bob' } }),
  ])
  aliceId = alice.id
  bobId = bob.id
  aliceToken = signTokenPair(alice.id, alice.role).accessToken
  bobToken = signTokenPair(bob.id, bob.role).accessToken
  console.log(`  setup ok — alice=${aliceId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [aliceId, bobId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } })
  console.log('  teardown ok')
}

async function makeJpegBuffer(width = 200, height = 200): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 80, g: 120, b: 200 },
    },
  }).jpeg({ quality: 90 }).toBuffer()
}

async function postAvatar(token: string, body: Buffer | string, contentType = 'image/jpeg') {
  const form = new FormData()
  const blob = new Blob([body as ArrayBuffer], { type: contentType })
  form.append('file', blob, 'avatar.jpg')
  const res = await fetch(`${BASE}/users/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

async function testAuthGuards() {
  console.log('\n=== Auth guards ===')
  const res = await fetch(`${BASE}/users/me/avatar`, { method: 'POST' })
  check('POST /users/me/avatar without token → 401', 401, res.status)

  const delRes = await fetch(`${BASE}/users/me/avatar`, { method: 'DELETE' })
  check('DELETE /users/me/avatar without token → 401', 401, delRes.status)
}

async function testHappyPath() {
  console.log('\n=== Upload happy path ===')
  const buf = await makeJpegBuffer(400, 600)
  const r = await postAvatar(aliceToken, buf)
  check('POST returns 200', 200, r.status)
  check('response includes avatarUrl', 'string', typeof r.body.avatarUrl)

  const user = await prisma.user.findUnique({ where: { id: aliceId }, select: { avatarUrl: true } })
  check('User.avatarUrl persisted', r.body.avatarUrl as string, user?.avatarUrl)

  // The local-fs backend writes to disk and returns /uploads/avatars/<uid>/<id>.webp
  const url = r.body.avatarUrl as string
  check('URL path includes the user id', true, url.includes(aliceId))
  check('URL path ends in .webp', true, url.endsWith('.webp'))

  // Inspect the actual stored file (when running against local-fs backend).
  if (url.startsWith('/uploads/')) {
    const root = process.env.LOCAL_UPLOADS_ROOT ?? path.resolve(process.cwd(), 'uploads')
    const filePath = path.join(root, url.replace(/^\/uploads\//, ''))
    const stat = await fs.stat(filePath).catch(() => null)
    check('written file exists on disk', true, stat !== null)
    if (stat) {
      check('written file is non-empty', true, stat.size > 0)
      // Sharp resized to 512×512 — verify by reading back
      const meta = await sharp(filePath).metadata()
      check('output is 512px wide', 512, meta.width)
      check('output is webp', 'webp', meta.format)
    }
  }
}

async function testRejectsBadInputs() {
  console.log('\n=== Validation ===')

  // Missing file
  const noFileRes = await fetch(`${BASE}/users/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: new FormData(),
  })
  check('no file → 400', 400, noFileRes.status)

  // Disallowed MIME
  const badMime = await postAvatar(aliceToken, Buffer.from('not-an-image'), 'application/pdf')
  check('disallowed MIME → 400', 400, badMime.status)

  // Garbage bytes that pass MIME but fail sharp
  const garbageJpeg = await postAvatar(aliceToken, Buffer.from('not-actually-a-jpeg'), 'image/jpeg')
  check('corrupt image bytes → 400', 400, garbageJpeg.status)
}

async function testDelete() {
  console.log('\n=== Delete ===')
  // Pre-condition: alice has an avatarUrl from happy-path test.
  const before = await prisma.user.findUnique({ where: { id: aliceId }, select: { avatarUrl: true } })
  check('precondition: avatarUrl exists', 'string', typeof before?.avatarUrl)

  const r = await fetch(`${BASE}/users/me/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${aliceToken}` },
  })
  check('DELETE returns 204', 204, r.status)

  const after = await prisma.user.findUnique({ where: { id: aliceId }, select: { avatarUrl: true } })
  check('avatarUrl cleared on User row', 'null', JSON.stringify(after?.avatarUrl))

  // Idempotent: second delete is also 204
  const again = await fetch(`${BASE}/users/me/avatar`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${aliceToken}` },
  })
  check('DELETE again (no avatar) → 204', 204, again.status)
}

async function testUploadIsScopedToCaller() {
  console.log('\n=== Scoping ===')
  const buf = await makeJpegBuffer()
  await postAvatar(bobToken, buf)
  const bob = await prisma.user.findUnique({ where: { id: bobId }, select: { avatarUrl: true } })
  check('bob has his own avatar', 'string', typeof bob?.avatarUrl)

  const alice = await prisma.user.findUnique({ where: { id: aliceId }, select: { avatarUrl: true } })
  check('alice still has no avatar (was deleted)', 'null', JSON.stringify(alice?.avatarUrl))
}

async function main() {
  try {
    await setup()
    await testAuthGuards()
    await testHappyPath()
    await testRejectsBadInputs()
    await testDelete()
    await testUploadIsScopedToCaller()
  } catch (err) {
    console.error('Test run threw:', err)
    fail++
  } finally {
    await teardown()
    await prisma.$disconnect()
  }
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main()
