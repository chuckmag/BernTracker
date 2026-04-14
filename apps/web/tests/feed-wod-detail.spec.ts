/**
 * Playwright E2E tests for Issue #48 — Feed page + WOD Detail page.
 *
 * Covers:
 *   T1: MEMBER sidebar shows Feed + History only (no Calendar/Members/Settings)
 *   T2: PROGRAMMER sidebar shows Feed + History + Calendar + Members + Settings
 *   T3: /feed shows published workouts grouped by day
 *   T4: Draft workouts do not appear on the feed for MEMBERs
 *   T5: Clicking a workout card navigates to /workouts/:id (WOD Detail)
 *   T6: WOD Detail shows workout info (type badge, title, description)
 *   T7: WOD Detail results table shows logged results
 *   T8: Level filter chips correctly filter results
 *   T9: "Your Result" badge appears when the current user has a result
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: npm run test --workspace=@berntracker/web
 *   or: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'module'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient, ProgramRole } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = Date.now()
const MEMBER_EMAIL = `uat-feed-member-${TS}@test.com`
const MEMBER_PASSWORD = 'TestPass1!'
const PROGRAMMER_EMAIL = `uat-feed-prog-${TS}@test.com`
const PROGRAMMER_PASSWORD = 'TestPass1!'

// Fixed future date that won't collide with other test data
const WORKOUT_DATE = '2026-07-15'
const WORKOUT_ISO = `${WORKOUT_DATE}T12:00:00.000Z`

let gymId = ''
let programId = ''
let memberUserId = ''
let programmerUserId = ''
let publishedWorkoutId = ''

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function seedResult(
  workoutId: string,
  userId: string,
  level: string,
  value: Record<string, unknown>,
) {
  return prisma.result.create({
    data: { workoutId, userId, level, workoutGender: 'OPEN', value },
  })
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function loginAndGoToFeed(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/feed')

  // Feed reads gymId from localStorage on mount
  await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)
  await page.goto('/feed')
  await page.waitForSelector('h1:has-text("Feed")')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Feed + WOD Detail E2E (#48)', () => {
  test.beforeAll(async () => {
    const [memberHash, programmerHash] = await Promise.all([
      bcrypt.hash(MEMBER_PASSWORD, 10),
      bcrypt.hash(PROGRAMMER_PASSWORD, 10),
    ])

    const gym = await prisma.gym.create({
      data: { name: `E2E Feed Gym ${TS}`, slug: `e2e-feed-gym-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id

    const [member, programmer] = await Promise.all([
      prisma.user.create({ data: { email: MEMBER_EMAIL, passwordHash: memberHash, name: 'E2E Member' } }),
      prisma.user.create({ data: { email: PROGRAMMER_EMAIL, passwordHash: programmerHash, name: 'E2E Programmer' } }),
    ])
    memberUserId = member.id
    programmerUserId = programmer.id

    await prisma.userGym.createMany({
      data: [
        { userId: memberUserId, gymId, role: 'MEMBER' },
        { userId: programmerUserId, gymId, role: 'PROGRAMMER' },
      ],
    })

    const program = await prisma.program.create({
      data: {
        name: `E2E Feed Program ${TS}`,
        startDate: new Date('2026-01-01'),
        gyms: { create: { gymId } },
        members: {
          createMany: {
            data: [
              { userId: memberUserId, role: ProgramRole.MEMBER },
              { userId: programmerUserId, role: ProgramRole.PROGRAMMER },
            ],
          },
        },
      },
    })
    programId = program.id

    const published = await prisma.workout.create({
      data: {
        title: 'E2E Fran',
        description: '21-15-9: Thrusters + Pull-ups',
        type: 'FOR_TIME',
        status: 'PUBLISHED',
        scheduledAt: new Date(WORKOUT_ISO),
        programId,
        dayOrder: 0,
      },
    })
    publishedWorkoutId = published.id

    // DRAFT workout — should not appear on the MEMBER feed
    await prisma.workout.create({
      data: {
        title: 'E2E Draft Warmup',
        description: 'Draft warmup',
        type: 'WARMUP',
        status: 'DRAFT',
        scheduledAt: new Date(WORKOUT_ISO),
        programId,
        dayOrder: 1,
      },
    })
  })

  test.afterAll(async () => {
    await prisma.result.deleteMany({ where: { workoutId: publishedWorkoutId } })
    await prisma.workout.deleteMany({ where: { programId } })
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: { in: [memberUserId, programmerUserId] } } })
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
    await prisma.$disconnect()
  })

  // ── T1: MEMBER sidebar shows Feed + History only ─────────────────────────

  test('T1: MEMBER sidebar shows Feed + History only, not staff links', async ({ page }) => {
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)

    // Feed + History must be visible
    await expect(page.getByRole('link', { name: 'Feed', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'History', exact: true })).toBeVisible()

    // Staff links must NOT be present
    await expect(page.getByRole('link', { name: 'Calendar', exact: true })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Members', exact: true })).not.toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).not.toBeVisible()
  })

  // ── T2: PROGRAMMER sidebar shows all links ───────────────────────────────

  test('T2: PROGRAMMER sidebar shows Feed + History + all staff links', async ({ page }) => {
    await loginAndGoToFeed(page, PROGRAMMER_EMAIL, PROGRAMMER_PASSWORD)

    // Member links
    await expect(page.getByRole('link', { name: 'Feed', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'History', exact: true })).toBeVisible()

    // Staff links — sidebar fetches gym role asynchronously; wait for Calendar to appear
    await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: 'Members', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings', exact: true })).toBeVisible()
  })

  // ── T3: Feed shows published workouts grouped by day ─────────────────────

  test('T3: /feed shows published workouts grouped by day', async ({ page }) => {
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)

    // Workout card is present
    await expect(page.getByText('E2E Fran')).toBeVisible()

    // Type abbreviation badge for FOR_TIME is "F"
    const card = page.locator('button', { hasText: 'E2E Fran' })
    await expect(card.getByText('F')).toBeVisible()
  })

  // ── T4: MEMBER feed does not show draft workouts ─────────────────────────

  test('T4: MEMBER feed does not show draft workouts', async ({ page }) => {
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)

    await expect(page.getByText('E2E Draft Warmup')).not.toBeVisible()
  })

  // ── T5: Clicking a card navigates to WOD Detail ──────────────────────────

  test('T5: clicking a workout card navigates to /workouts/:id', async ({ page }) => {
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)

    await page.locator('button', { hasText: 'E2E Fran' }).click()

    await page.waitForURL(`**/workouts/${publishedWorkoutId}`)
    await expect(page.getByRole('heading', { name: 'E2E Fran' })).toBeVisible()
  })

  // ── T6: WOD Detail shows workout info ────────────────────────────────────

  test('T6: WOD Detail shows type badge, title, date, and description', async ({ page }) => {
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto(`/workouts/${publishedWorkoutId}`)
    await page.waitForSelector(`h1:has-text("E2E Fran")`)

    // Type badge
    await expect(page.locator('span', { hasText: 'F' }).first()).toBeVisible()

    // Title
    await expect(page.getByRole('heading', { name: 'E2E Fran' })).toBeVisible()

    // Description
    await expect(page.getByText('21-15-9: Thrusters + Pull-ups')).toBeVisible()

    // Scheduled date contains "Jul" (July 15)
    await expect(page.getByText(/Jul.*15.*2026/)).toBeVisible()

    // Log Result button present when user has no result
    await expect(page.getByRole('button', { name: 'Log Result' })).toBeVisible()

    // Back link
    await expect(page.getByText('← Back to Feed')).toBeVisible()
  })

  // ── T7: WOD Detail results table shows logged results ────────────────────

  test('T7: results table shows results after they are logged', async ({ page }) => {
    // Seed a result directly via Prisma
    await seedResult(publishedWorkoutId, programmerUserId, 'RX', {
      type: 'FOR_TIME',
      seconds: 240,
      cappedOut: false,
    })

    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto(`/workouts/${publishedWorkoutId}`)
    await page.waitForSelector(`h1:has-text("E2E Fran")`)

    // Results section header
    await expect(page.getByText('Results', { exact: true })).toBeVisible()

    // Programmer's result appears in the table
    await expect(page.getByText('E2E Programmer')).toBeVisible()
    await expect(page.getByText('4:00')).toBeVisible()

    // Cleanup result for next test
    await prisma.result.deleteMany({ where: { workoutId: publishedWorkoutId, userId: programmerUserId } })
  })

  // ── T8: Level filter chips filter results ────────────────────────────────

  test('T8: level filter chips correctly filter results', async ({ page }) => {
    // Seed an RX result and a SCALED result
    await Promise.all([
      seedResult(publishedWorkoutId, memberUserId, 'RX', { type: 'FOR_TIME', seconds: 185, cappedOut: false }),
      seedResult(publishedWorkoutId, programmerUserId, 'SCALED', { type: 'FOR_TIME', seconds: 240, cappedOut: false }),
    ])

    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto(`/workouts/${publishedWorkoutId}`)
    await page.waitForSelector(`h1:has-text("E2E Fran")`)

    // "All" filter: both results visible
    await expect(page.getByText('E2E Member')).toBeVisible()
    await expect(page.getByText('E2E Programmer')).toBeVisible()

    // Click "RX" filter: only E2E Member (RX) visible, programmer hidden
    await page.getByRole('button', { name: 'RX', exact: true }).click()
    await expect(page.getByText('E2E Member')).toBeVisible()
    await expect(page.getByText('E2E Programmer')).not.toBeVisible()

    // Click "Scaled" filter: only programmer visible
    await page.getByRole('button', { name: 'Scaled' }).click()
    await expect(page.getByText('E2E Programmer')).toBeVisible()
    await expect(page.getByText('E2E Member')).not.toBeVisible()

    // Click "All" to reset
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByText('E2E Member')).toBeVisible()
    await expect(page.getByText('E2E Programmer')).toBeVisible()
  })

  // ── T9: "Your Result" badge when current user has a result ───────────────

  test('T9: "Your Result" badge replaces Log Result button when user has a result', async ({ page }) => {
    // memberUserId already has an RX result from T8 (seeded above, not cleaned up yet)
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto(`/workouts/${publishedWorkoutId}`)
    await page.waitForSelector(`h1:has-text("E2E Fran")`)

    // "Your Result" label is visible
    await expect(page.getByText('Your Result')).toBeVisible()

    // Log Result button is NOT visible when user already has a result
    await expect(page.getByRole('button', { name: 'Log Result' })).not.toBeVisible()
  })

  // ── T10: Feed + WOD Detail usable at 375px (mobile viewport) ────────────

  test('T10: Feed and WOD Detail are usable at 375px mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAndGoToFeed(page, MEMBER_EMAIL, MEMBER_PASSWORD)

    // Feed: workout card is still visible and not clipped
    const card = page.locator('button', { hasText: 'E2E Fran' })
    await expect(card).toBeVisible()
    const cardBox = await card.boundingBox()
    expect(cardBox?.width).toBeGreaterThan(0)
    expect(cardBox?.x).toBeGreaterThanOrEqual(0)

    // WOD Detail: navigates and renders within viewport
    await card.click()
    await page.waitForURL(`**/workouts/${publishedWorkoutId}`)
    await expect(page.getByRole('heading', { name: 'E2E Fran' })).toBeVisible()

    // Heading must not overflow the viewport
    const headingBox = await page.getByRole('heading', { name: 'E2E Fran' }).boundingBox()
    expect((headingBox?.x ?? 0) + (headingBox?.width ?? 0)).toBeLessThanOrEqual(375 + 1)
  })
})
