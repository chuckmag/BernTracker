/**
 * Integration tests for the gym logo upload endpoint (#145).
 *
 * Re-uses the local-fs storage backend so no AWS creds needed in CI. Builds on
 * the same image pipeline that ships with slice C (avatar upload, #144).
 *
 * Requires: API running on localhost:3000 (or API_URL), DB accessible.
 * Run: cd apps/api && npx tsx tests/gymLogo.ts
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

async function api(method: string, path: string, token?: string, body?: BodyInit) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json as Record<string, unknown> }
}

async function postLogo(gymId: string, token: string, body: Buffer | string, contentType = 'image/jpeg') {
  const form = new FormData()
  const blob = new Blob([body as ArrayBuffer], { type: contentType })
  form.append('file', blob, 'logo.jpg')
  return api('POST', `/gyms/${gymId}/logo`, token, form)
}

async function makeJpegBuffer(width = 200, height = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).jpeg({ quality: 90 }).toBuffer()
}

const TS = Date.now()

let gymId = '', otherGymId = ''
let ownerId = '', ownerToken = ''
let programmerId = '', programmerToken = ''
let coachId = '', coachToken = ''
let memberId = '', memberToken = ''
let outsiderId = '', outsiderToken = ''

async function setup() {
  console.log('\n=== Setup ===')
  const [gym, other] = await Promise.all([
    prisma.gym.create({ data: { name: `Logo Gym ${TS}`, slug: `logo-${TS}`, timezone: 'UTC' } }),
    prisma.gym.create({ data: { name: `Logo Other ${TS}`, slug: `logo-other-${TS}`, timezone: 'UTC' } }),
  ])
  gymId = gym.id
  otherGymId = other.id

  const [owner, programmer, coach, member, outsider] = await Promise.all([
    prisma.user.create({ data: { email: `logo-owner-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `logo-prog-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `logo-coach-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `logo-member-${TS}@test.com` } }),
    prisma.user.create({ data: { email: `logo-out-${TS}@test.com` } }),
  ])
  ownerId = owner.id
  programmerId = programmer.id
  coachId = coach.id
  memberId = member.id
  outsiderId = outsider.id

  await prisma.userGym.createMany({
    data: [
      { userId: ownerId, gymId, role: 'OWNER' },
      { userId: programmerId, gymId, role: 'PROGRAMMER' },
      { userId: coachId, gymId, role: 'COACH' },
      { userId: memberId, gymId, role: 'MEMBER' },
    ],
  })

  ownerToken = signTokenPair(ownerId, 'OWNER').accessToken
  programmerToken = signTokenPair(programmerId, 'PROGRAMMER').accessToken
  coachToken = signTokenPair(coachId, 'COACH').accessToken
  memberToken = signTokenPair(memberId, 'MEMBER').accessToken
  outsiderToken = signTokenPair(outsiderId, 'MEMBER').accessToken
  console.log(`  setup ok — gym=${gymId}`)
}

async function teardown() {
  console.log('\n=== Teardown ===')
  await prisma.userGym.deleteMany({ where: { gymId: { in: [gymId, otherGymId] } } })
  await prisma.refreshToken.deleteMany({
    where: { userId: { in: [ownerId, programmerId, coachId, memberId, outsiderId] } },
  })
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, programmerId, coachId, memberId, outsiderId] } },
  })
  await prisma.gym.deleteMany({ where: { id: { in: [gymId, otherGymId] } } })
  console.log('  teardown ok')
}

async function testAuthGuards() {
  console.log('\n=== Auth + role guards ===')
  check('POST without token → 401',
    401, (await api('POST', `/gyms/${gymId}/logo`)).status)
  check('DELETE without token → 401',
    401, (await api('DELETE', `/gyms/${gymId}/logo`)).status)

  const buf = await makeJpegBuffer()

  check('OUTSIDER (not a member) → 403',
    403, (await postLogo(gymId, outsiderToken, buf)).status)
  check('MEMBER → 403',
    403, (await postLogo(gymId, memberToken, buf)).status)
  // COACH has gym write access for daily ops but shouldn't rebrand the gym.
  check('COACH → 403 (branding is owner-level)',
    403, (await postLogo(gymId, coachToken, buf)).status)
}

async function testHappyPath() {
  console.log('\n=== Upload happy path ===')

  const ownerBuf = await makeJpegBuffer(800, 400)
  const r = await postLogo(gymId, ownerToken, ownerBuf)
  check('OWNER POST → 200', 200, r.status)
  check('response includes logoUrl', 'string', typeof r.body.logoUrl)

  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { logoUrl: true } })
  check('Gym.logoUrl persisted', r.body.logoUrl as string, gym?.logoUrl)

  const url = r.body.logoUrl as string
  check('URL path is gym-scoped', true, url.includes(`gyms/${gymId}`))
  check('URL path ends in .webp', true, url.endsWith('.webp'))

  // PROGRAMMER replaces it
  const progBuf = await makeJpegBuffer(400, 400)
  const r2 = await postLogo(gymId, programmerToken, progBuf)
  check('PROGRAMMER POST → 200', 200, r2.status)

  // Inspect the actual file when running against local-fs.
  if ((r2.body.logoUrl as string).startsWith('/uploads/')) {
    const root = process.env.LOCAL_UPLOADS_ROOT ?? path.resolve(process.cwd(), 'uploads')
    const filePath = path.join(root, (r2.body.logoUrl as string).replace(/^\/uploads\//, ''))
    const meta = await sharp(filePath).metadata()
    check('output is 512px wide', 512, meta.width)
    check('output is webp', 'webp', meta.format)
    const stat = await fs.stat(filePath).catch(() => null)
    check('written file exists', true, stat !== null)
  }
}

async function testValidation() {
  console.log('\n=== Validation ===')

  const noFile = await api('POST', `/gyms/${gymId}/logo`, ownerToken, new FormData())
  check('no file → 400', 400, noFile.status)

  const badMime = await postLogo(gymId, ownerToken, Buffer.from('not-an-image'), 'application/pdf')
  check('disallowed MIME → 400', 400, badMime.status)

  const garbage = await postLogo(gymId, ownerToken, Buffer.from('garbage-jpeg'), 'image/jpeg')
  check('corrupt image bytes → 400', 400, garbage.status)
}

async function testDelete() {
  console.log('\n=== Delete ===')
  const before = await prisma.gym.findUnique({ where: { id: gymId }, select: { logoUrl: true } })
  check('precondition: logoUrl exists', 'string', typeof before?.logoUrl)

  const r = await api('DELETE', `/gyms/${gymId}/logo`, ownerToken)
  check('OWNER DELETE → 204', 204, r.status)

  const after = await prisma.gym.findUnique({ where: { id: gymId }, select: { logoUrl: true } })
  check('logoUrl cleared', 'null', JSON.stringify(after?.logoUrl))

  const again = await api('DELETE', `/gyms/${gymId}/logo`, ownerToken)
  check('DELETE again → 204', 204, again.status)

  // PROGRAMMER can also delete (re-upload first to have something to delete)
  await postLogo(gymId, programmerToken, await makeJpegBuffer())
  const rProg = await api('DELETE', `/gyms/${gymId}/logo`, programmerToken)
  check('PROGRAMMER DELETE → 204', 204, rProg.status)

  // COACH cannot delete
  await postLogo(gymId, ownerToken, await makeJpegBuffer())
  const rCoach = await api('DELETE', `/gyms/${gymId}/logo`, coachToken)
  check('COACH DELETE → 403', 403, rCoach.status)
}

async function testScoping() {
  console.log('\n=== Scoping ===')
  // OWNER of gymId is not a member of otherGymId — should 403.
  const buf = await makeJpegBuffer()
  const rOther = await postLogo(otherGymId, ownerToken, buf)
  check('uploading to a gym you don\'t belong to → 403', 403, rOther.status)

  const otherGym = await prisma.gym.findUnique({ where: { id: otherGymId }, select: { logoUrl: true } })
  check('other gym\'s logoUrl untouched', 'null', JSON.stringify(otherGym?.logoUrl))
}

async function main() {
  try {
    await setup()
    await testAuthGuards()
    await testHappyPath()
    await testValidation()
    await testDelete()
    await testScoping()
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
