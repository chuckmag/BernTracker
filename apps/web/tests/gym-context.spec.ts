/**
 * Playwright E2E tests for PR #65 — GymContext: auto-recover gymId + reactive gym switching.
 *
 * Covers:
 *   T1: No gymId in localStorage → GymContext auto-selects first gym; Feed loads data
 *   T2: Single-gym account → TopBar shows gym name as static text (no dropdown)
 *   T3: No gym account → TopBar shows "Set up a gym →" link
 *   T4: Multi-gym account → TopBar shows a <select> dropdown with both gym names
 *   T5: Switching gyms via dropdown updates Feed reactively — no full page reload
 *   T6: Exactly one /api/me/gyms request fires per app mount
 *   T7: History page loads normally with no gymId in localStorage
 *   T8: WodDetail loads normally with no gymId in localStorage
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: npm run test --workspace=@wodalytics/web
 *   or: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient, ProgramRole } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TS = randomUUID().slice(0, 8)
const PW = 'TestPass1!'

const SINGLE_EMAIL  = `uat-gymctx-single-${TS}@test.com`
const MULTI_EMAIL   = `uat-gymctx-multi-${TS}@test.com`
const NOGYM_EMAIL   = `uat-gymctx-nogym-${TS}@test.com`

// Dates within Feed's [today - 30, today + 14] window so seeded workouts are
// visible on /feed.
const GYM_A_DATE = (() => {
  const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10)
})()
const GYM_B_DATE = (() => {
  const d = new Date(); d.setDate(d.getDate() + 4); return d.toISOString().slice(0, 10)
})()

let singleUserId  = ''
let multiUserId   = ''
let noGymUserId   = ''

let gymAId = ''
let gymBId = ''
let programAId = ''
let programBId = ''
let workoutAId = ''   // published in Gym A — title "GymA Workout"
let workoutBId = ''   // published in Gym B — title "GymB Workout"
let historyWorkoutId = ''  // for T7 WodDetail

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function seedWorkout(title: string, programId: string, isoDate: string) {
  return prisma.workout.create({
    data: {
      title,
      description: 'GymContext UAT',
      type: 'AMRAP',
      status: 'PUBLISHED',
      scheduledAt: new Date(`${isoDate}T12:00:00.000Z`),
      programId,
      dayOrder: 0,
    },
  })
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

/** Log in. Does NOT set gymId in localStorage. */
async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', PW)
  await page.click('button[type="submit"]')
  // Login.tsx navigates everyone to /dashboard; pages are reached by explicit goto.
  await page.waitForURL('**/dashboard', { waitUntil: 'commit' })
}

/** Navigate to Feed and wait for the heading. */
async function goToFeed(page: Page) {
  await page.goto('/feed')
  await page.waitForSelector('h1:has-text("Feed")')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('GymContext E2E (PR #65)', () => {
  test.beforeAll(async () => {
    const [singleHash, multiHash, noGymHash] = await Promise.all([
      bcrypt.hash(PW, 10),
      bcrypt.hash(PW, 10),
      bcrypt.hash(PW, 10),
    ])

    // Create users
    const [single, multi, noGym] = await Promise.all([
      prisma.user.create({ data: { email: SINGLE_EMAIL, passwordHash: singleHash, name: 'Single Gym User' } }),
      prisma.user.create({ data: { email: MULTI_EMAIL,  passwordHash: multiHash,  name: 'Multi Gym User'  } }),
      prisma.user.create({ data: { email: NOGYM_EMAIL,  passwordHash: noGymHash,  name: 'No Gym User'     } }),
    ])
    singleUserId = single.id
    multiUserId  = multi.id
    noGymUserId  = noGym.id

    // Create two gyms
    const [gymA, gymB] = await Promise.all([
      prisma.gym.create({ data: { name: `GymCtx A ${TS}`, slug: `gymctx-a-${TS}`, timezone: 'UTC' } }),
      prisma.gym.create({ data: { name: `GymCtx B ${TS}`, slug: `gymctx-b-${TS}`, timezone: 'UTC' } }),
    ])
    gymAId = gymA.id
    gymBId = gymB.id

    // Gym memberships
    await prisma.userGym.createMany({
      data: [
        { userId: singleUserId, gymId: gymAId, role: 'PROGRAMMER' },
        { userId: multiUserId,  gymId: gymAId, role: 'PROGRAMMER' },
        { userId: multiUserId,  gymId: gymBId, role: 'PROGRAMMER' },
      ],
    })

    // Programs (one per gym)
    const [progA, progB] = await Promise.all([
      prisma.program.create({
        data: {
          name: `GymCtx ProgramA ${TS}`,
          startDate: new Date('2026-01-01'),
          gyms: { create: { gymId: gymAId } },
          members: {
            createMany: {
              data: [
                { userId: singleUserId, role: ProgramRole.PROGRAMMER },
                { userId: multiUserId,  role: ProgramRole.PROGRAMMER },
              ],
            },
          },
        },
      }),
      prisma.program.create({
        data: {
          name: `GymCtx ProgramB ${TS}`,
          startDate: new Date('2026-01-01'),
          gyms: { create: { gymId: gymBId } },
          members: { create: { userId: multiUserId, role: ProgramRole.PROGRAMMER } },
        },
      }),
    ])
    programAId = progA.id
    programBId = progB.id

    // Published workouts — distinct titles so tests can assert which gym's data is shown
    const [wA, wB] = await Promise.all([
      seedWorkout('GymA Workout', programAId, GYM_A_DATE),
      seedWorkout('GymB Workout', programBId, GYM_B_DATE),
    ])
    workoutAId = wA.id
    workoutBId = wB.id
    historyWorkoutId = wA.id
  })

  test.afterAll(async () => {
    await prisma.workout.deleteMany({ where: { id: { in: [workoutAId, workoutBId] } } })
    await prisma.program.deleteMany({ where: { id: { in: [programAId, programBId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [singleUserId, multiUserId, noGymUserId] } } })
    await prisma.gym.deleteMany({ where: { id: { in: [gymAId, gymBId] } } })
    await prisma.$disconnect()
  })

  // ── T1: auto-selects first gym when localStorage has no gymId ────────────

  test('T1: no gymId in localStorage — GymContext auto-selects first gym and Feed loads', async ({ page }) => {
    await login(page, SINGLE_EMAIL)

    // Confirm localStorage has no gymId after login redirect
    await page.evaluate(() => localStorage.removeItem('gymId'))

    await goToFeed(page)

    // GymContext should auto-select the gym; workout from Gym A should be visible
    await expect(page.getByText('GymA Workout')).toBeVisible({ timeout: 5000 })

    // localStorage should now have gymId set by GymContext
    const storedId = await page.evaluate(() => localStorage.getItem('gymId'))
    expect(storedId).toBe(gymAId)
  })

  // ── T2: single-gym TopBar shows static text, not a dropdown ─────────────

  test('T2: single-gym account — TopBar shows gym name as static text', async ({ page }) => {
    await login(page, SINGLE_EMAIL)
    await goToFeed(page)

    // Static gym name text must be visible
    await expect(page.getByText(`GymCtx A ${TS}`, { exact: true })).toBeVisible({ timeout: 5000 })

    // No <select> element should be in the header
    await expect(page.locator('header select')).not.toBeVisible()
  })

  // ── T3: no-gym account → TopBar shows "Set up a gym →" link ─────────────

  test('T3: no-gym account — TopBar shows "Set up a gym →" link', async ({ page }) => {
    await login(page, NOGYM_EMAIL)
    await goToFeed(page)

    await expect(page.getByText('Set up a gym →')).toBeVisible({ timeout: 5000 })

    // No gym name and no select
    await expect(page.locator('header select')).not.toBeVisible()
  })

  // ── T4: multi-gym TopBar shows <select> with both gym names ─────────────

  test('T4: multi-gym account — TopBar shows dropdown with both gym names', async ({ page }) => {
    await login(page, MULTI_EMAIL)
    await goToFeed(page)

    const select = page.locator('header select')
    await expect(select).toBeVisible({ timeout: 5000 })

    // Both gym names appear as options
    await expect(select.locator(`option:has-text("GymCtx A ${TS}")`)).toBeAttached()
    await expect(select.locator(`option:has-text("GymCtx B ${TS}")`)).toBeAttached()
  })

  // ── T5: switching gyms updates Feed reactively — no full page reload ─────

  test('T5: switching gyms via TopBar dropdown updates Feed without a full page reload', async ({ page }) => {
    await login(page, MULTI_EMAIL)
    // Seed gymId = A so we start on Gym A
    await page.evaluate((id) => localStorage.setItem('gymId', id), gymAId)
    await goToFeed(page)

    // Gym A workout is visible
    await expect(page.getByText('GymA Workout')).toBeVisible({ timeout: 5000 })

    // Track page load events — a reload would fire a new 'load' event
    let reloadFired = false
    page.on('load', () => { reloadFired = true })

    // Switch to Gym B via the TopBar dropdown
    await page.locator('header select').selectOption(gymBId)

    // Gym B workout should appear; Gym A workout should disappear
    await expect(page.getByText('GymB Workout')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('GymA Workout')).not.toBeVisible()

    // No full page reload occurred
    expect(reloadFired).toBe(false)

    // localStorage updated to Gym B
    const storedId = await page.evaluate(() => localStorage.getItem('gymId'))
    expect(storedId).toBe(gymBId)
  })

  // ── T6: only one /api/me/gyms request fires per page load ───────────────

  test('T6: only one /api/me/gyms request fires per app mount', async ({ page }) => {
    let gymsRequestCount = 0
    page.on('request', (req) => {
      if (req.url().includes('/api/me/gyms')) gymsRequestCount++
    })

    await login(page, SINGLE_EMAIL)
    await page.evaluate((id) => localStorage.setItem('gymId', id), gymAId)
    await goToFeed(page)

    // Wait for Feed to fully load so all async requests have fired
    await expect(page.getByText('GymA Workout')).toBeVisible({ timeout: 5000 })

    expect(gymsRequestCount).toBe(1)
  })

  // ── T7: History loads with no gymId in localStorage ─────────────────────

  test('T7: History page loads normally with no gymId in localStorage', async ({ page }) => {
    await login(page, SINGLE_EMAIL)
    await page.evaluate(() => localStorage.removeItem('gymId'))

    await page.goto('/history')
    await page.waitForSelector('h1:has-text("History")')

    // Page renders without error — empty state or results both count as success
    await expect(page.locator('h1:has-text("History")')).toBeVisible()
    await expect(page.getByText('Something went wrong')).not.toBeVisible()
  })

  // ── T8: WodDetail loads with no gymId in localStorage ───────────────────

  test('T8: WodDetail loads normally with no gymId in localStorage', async ({ page }) => {
    await login(page, SINGLE_EMAIL)
    await page.evaluate(() => localStorage.removeItem('gymId'))

    await page.goto(`/workouts/${historyWorkoutId}`)
    await page.waitForSelector('h1:has-text("GymA Workout")')

    // Workout title and description are rendered
    await expect(page.getByRole('heading', { name: 'GymA Workout' })).toBeVisible()
    await expect(page.getByText('GymContext UAT')).toBeVisible()
  })
})
