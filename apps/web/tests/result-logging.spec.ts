/**
 * Playwright E2E tests for Issue #49 — Member Web: Result Logging + History.
 *
 * Covers:
 *   T1: "Log Result" button is visible and enabled on a fresh WOD detail (no prior result)
 *   T2: Submit AMRAP result via drawer → "Your Result" display appears + result in leaderboard
 *   T3: Reload WOD detail after logging → "Log Result" button absent, "Your Result" still shown
 *   T4: Submit FOR_TIME result (time capped) → "CAPPED" appears in leaderboard
 *   T5: /history shows logged results grouped by month
 *   T6: Click a history row navigates to the correct WOD detail page
 *
 * Note: 409 duplicate-log path is covered by apps/api/tests/results.ts.
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
const MEMBER_EMAIL = `uat-result-member-${TS}@test.com`
const MEMBER_PASSWORD = 'TestPass1!'

// Fixed dates that won't collide with other test suites
const AMRAP_DATE  = '2026-08-01'
const FORTIME_DATE = '2026-08-02'

let gymId = ''
let programId = ''
let memberUserId = ''
let amrapWorkoutId = ''
let forTimeWorkoutId = ''

// ─── DB helper ────────────────────────────────────────────────────────────────

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#email', MEMBER_EMAIL)
  await page.fill('#password', MEMBER_PASSWORD)
  await page.click('button[type="submit"]')
  // Login.tsx navigates everyone to /dashboard; Feed/WOD pages reached by goto.
  await page.waitForURL('**/dashboard', { waitUntil: 'commit' })
}

async function goToWod(page: Page, workoutId: string) {
  await page.goto(`/workouts/${workoutId}`)
  await page.waitForSelector('[class*="space-y-6"]')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Result Logging + History E2E (#49)', () => {
  test.beforeAll(async () => {
    const memberHash = await bcrypt.hash(MEMBER_PASSWORD, 10)

    const gym = await prisma.gym.create({
      data: { name: `E2E Result Gym ${TS}`, slug: `e2e-result-gym-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id

    const member = await prisma.user.create({
      data: { email: MEMBER_EMAIL, passwordHash: memberHash, name: 'E2E Result Member' },
    })
    memberUserId = member.id

    await prisma.userGym.create({ data: { userId: memberUserId, gymId, role: 'MEMBER' } })

    const program = await prisma.program.create({
      data: {
        name: `E2E Result Program ${TS}`,
        startDate: new Date('2026-01-01'),
        gyms: { create: { gymId } },
        members: { create: { userId: memberUserId, role: ProgramRole.MEMBER } },
      },
    })
    programId = program.id

    const amrap = await prisma.workout.create({
      data: {
        title: 'E2E AMRAP Test',
        description: 'AMRAP 20: 5 Pull-ups, 10 Push-ups, 15 Squats',
        type: 'AMRAP',
        status: 'PUBLISHED',
        scheduledAt: new Date(`${AMRAP_DATE}T12:00:00.000Z`),
        programId,
        dayOrder: 0,
      },
    })
    amrapWorkoutId = amrap.id

    const forTime = await prisma.workout.create({
      data: {
        title: 'E2E For Time Test',
        description: '21-15-9: Thrusters + Pull-ups',
        type: 'FOR_TIME',
        status: 'PUBLISHED',
        scheduledAt: new Date(`${FORTIME_DATE}T12:00:00.000Z`),
        programId,
        dayOrder: 0,
      },
    })
    forTimeWorkoutId = forTime.id
  })

  test.afterAll(async () => {
    await prisma.result.deleteMany({
      where: { workoutId: { in: [amrapWorkoutId, forTimeWorkoutId] } },
    })
    await prisma.workout.deleteMany({ where: { programId } })
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
    await prisma.user.delete({ where: { id: memberUserId } }).catch(() => {})
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
    await prisma.$disconnect()
  })

  // ── T1: Log Result button visible on fresh WOD detail ───────────────────────

  test('T1: Log Result button is visible and enabled on a WOD with no prior result', async ({ page }) => {
    await login(page)
    await goToWod(page, amrapWorkoutId)

    await expect(page.getByRole('heading', { name: 'E2E AMRAP Test' })).toBeVisible()
    const btn = page.getByRole('button', { name: 'Log Result' })
    await expect(btn).toBeVisible()
    await expect(btn).toBeEnabled()
  })

  // ── T2: Log AMRAP result via drawer ─────────────────────────────────────────

  test('T2: logging an AMRAP result → "Your Result" appears + leaderboard updated', async ({ page }) => {
    await login(page)
    await goToWod(page, amrapWorkoutId)

    // Open the drawer
    await page.getByRole('button', { name: 'Log Result' }).click()
    await expect(page.getByText('Log Result', { exact: true }).first()).toBeVisible()

    // Drawer header shows workout title — disambiguate from the page <h1>
    // by anchoring to the truncated drawer subtitle <p>.
    await expect(page.locator('p', { hasText: 'E2E AMRAP Test' })).toBeVisible()

    // Select Scaled level
    await page.getByRole('button', { name: 'Scaled', exact: true }).click()

    // Fill in Rounds and Reps
    await page.fill('input[placeholder="0"]:near(:text("Rounds"))', '7')
    // find the Reps input specifically (second "0" placeholder)
    const inputs = page.locator('input[placeholder="0"]')
    await inputs.nth(0).fill('7')
    await inputs.nth(1).fill('4')

    // Submit
    await page.getByRole('button', { name: 'Save Result' }).click()

    // Drawer should close and "Your Result" should appear
    await expect(page.getByText('Your Result')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Log Result' })).not.toBeVisible()

    // Leaderboard should show the result value (anchor to the table cell to
    // disambiguate from the "Your Result" summary span).
    await expect(page.getByRole('cell', { name: /7 rounds \+ 4 reps/ })).toBeVisible()

    // "(you)" label visible for current user's row
    await expect(page.getByText('(you)')).toBeVisible()
  })

  // ── T3: Reload WOD detail → "Your Result" persists, Log Result hidden ───────

  test('T3: after reload, "Your Result" still shown and Log Result button absent', async ({ page }) => {
    await login(page)
    await goToWod(page, amrapWorkoutId)

    await expect(page.getByText('Your Result')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log Result' })).not.toBeVisible()
  })

  // ── T4: Log FOR_TIME result (capped) → "CAPPED" in leaderboard ──────────────

  test('T4: logging a capped FOR_TIME result shows "CAPPED" in the leaderboard', async ({ page }) => {
    await login(page)
    await goToWod(page, forTimeWorkoutId)

    await page.getByRole('button', { name: 'Log Result' }).click()
    await expect(page.getByText('Log Result', { exact: true }).first()).toBeVisible()

    // Check "Time capped" checkbox
    await page.getByLabel('Time capped').check()

    // Min/Sec inputs should be disabled when capped
    const minInput = page.locator('input[placeholder="0"]').first()
    await expect(minInput).toBeDisabled()

    // Submit
    await page.getByRole('button', { name: 'Save Result' }).click()

    // Drawer closes, "Your Result" appears
    await expect(page.getByText('Your Result')).toBeVisible({ timeout: 5000 })

    // Leaderboard shows "CAPPED"
    await expect(page.getByText('CAPPED')).toBeVisible()
  })

  // ── T5: /history shows logged results grouped by month ──────────────────────

  test('T5: /history shows both logged results grouped by their month', async ({ page }) => {
    await login(page)
    await page.goto('/history')
    await page.waitForSelector('h1:has-text("History")')

    // August 2026 month group header
    await expect(page.getByText('August 2026')).toBeVisible()

    // Both workout titles present
    await expect(page.getByText('E2E AMRAP Test')).toBeVisible()
    await expect(page.getByText('E2E For Time Test')).toBeVisible()

    // AMRAP result value
    await expect(page.getByText('7 rounds + 4 reps')).toBeVisible()

    // FOR_TIME capped result
    await expect(page.getByText('CAPPED')).toBeVisible()
  })

  // ── T6: Click history row navigates to WOD detail ───────────────────────────

  test('T6: clicking a history row navigates to the correct WOD detail page', async ({ page }) => {
    await login(page)
    await page.goto('/history')
    await page.waitForSelector('h1:has-text("History")')

    // Click the AMRAP row
    await page.locator('button', { hasText: 'E2E AMRAP Test' }).click()

    await page.waitForURL(`**/workouts/${amrapWorkoutId}`)
    await expect(page.getByRole('heading', { name: 'E2E AMRAP Test' })).toBeVisible()
  })
})
