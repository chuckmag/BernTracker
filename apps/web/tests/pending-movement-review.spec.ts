/**
 * Playwright E2E tests for PR #72 — Pending movement inline edit.
 *
 * Covers the manual verification checklist from the PR:
 *   T1: Rename a pending movement → save → row shows updated name
 *   T2: Set parent movement via typeahead → save → row shows "variation of X" tag
 *   T3: Clear parent → save → "variation of" tag disappears
 *   T4: Cancel edit → row reverts to its current state (no DB change)
 *   T5: Approve a pending movement → row disappears from the list
 *   T6: Reject a pending movement → row disappears from the list
 *
 * The reviewer is identified by MOVEMENT_REVIEWER_EMAIL in .env. That user
 * likely authenticates via Google OAuth and has no password. The test temporarily
 * sets a passwordHash so the normal login form works, then restores null in afterAll.
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: npm run test:e2e --workspace=@berntracker/web
 */

import { test, expect, type Page, type Cookie } from '@playwright/test'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Shared state ─────────────────────────────────────────────────────────────

const TS = randomUUID().slice(0, 8)
const REVIEWER_TEST_PASSWORD = 'TestPass-E2E-1!'

let reviewerUserId = ''
let originalPasswordHash: string | null = null
let gymId = ''

let parentMovementName = ''

// Separate pending movements so serial tests don't clobber each other
let pendingEditId = ''           // T1–T4
const PENDING_EDIT_ORIGINAL = `Pending-Edit-${TS}`

let pendingApproveId = ''        // T5
let pendingRejectId = ''         // T6

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Saved after the first login so subsequent tests can skip re-authenticating.
// Each test's fresh browser context starts with no cookies; injecting saved
// cookies lets the auth context call /api/auth/refresh with a valid token
// instead of requiring a full re-login (which hangs when run back-to-back).
let savedCookies: Cookie[] = []

async function goToSettings(page: Page) {
  // addInitScript runs before every full page load on this page object, ensuring
  // gymId is in localStorage before React's GymContext initializes.
  await page.addInitScript((id) => localStorage.setItem('gymId', id), gymId)

  if (savedCookies.length === 0) {
    // First test: do a full password login.
    const reviewerEmail = process.env.MOVEMENT_REVIEWER_EMAIL!
    await page.goto('/login')
    await page.waitForSelector('#email')
    await page.fill('#email', reviewerEmail)
    await page.fill('#password', REVIEWER_TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  } else {
    // Subsequent tests: inject the cookies saved after the previous test's
    // settings page loaded.  The refreshToken cookie is the current valid
    // token — the auth context will rotate it on this page load.
    await page.context().addCookies(savedCookies)
  }

  await page.goto('/settings')
  await page.waitForSelector('h2:has-text("Pending Movements")')
  // Save cookies AFTER the auth context has refreshed (settings visible = auth ok).
  // The new refreshToken here is valid for the next test.
  savedCookies = await page.context().cookies()
}

/**
 * Finds the pending movement row by its visible name text (before editing opens).
 * The name text is only visible when the row is in display mode — in edit mode
 * the name lives in an input value, not as visible text.
 */
function displayRow(page: Page, name: string) {
  return page.locator('div.bg-gray-900').filter({ hasText: name }).filter({
    has: page.getByRole('button', { name: 'Edit' }),
  })
}

/**
 * Returns the row currently open in edit mode (identified by the Save button).
 * At most one row is in edit mode at a time.
 */
function editingRow(page: Page) {
  return page.locator('div.bg-gray-900').filter({
    has: page.getByRole('button', { name: 'Save' }),
  })
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Pending movement inline edit E2E (#72)', () => {
  test.beforeAll(async () => {
    const reviewerEmail = process.env.MOVEMENT_REVIEWER_EMAIL
    if (!reviewerEmail) throw new Error('MOVEMENT_REVIEWER_EMAIL must be set in .env')

    // Find the reviewer user and save their current passwordHash
    const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail } })
    if (!reviewer) throw new Error(`Reviewer user not found: ${reviewerEmail}`)
    reviewerUserId = reviewer.id
    originalPasswordHash = reviewer.passwordHash

    // Temporarily enable password login for the test
    const testHash = await bcrypt.hash(REVIEWER_TEST_PASSWORD, 10)
    await prisma.user.update({ where: { id: reviewerUserId }, data: { passwordHash: testHash } })

    // Create a test gym and add the reviewer as OWNER
    const gym = await prisma.gym.create({
      data: { name: `E2E Review Gym ${TS}`, slug: `e2e-review-gym-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id
    await prisma.userGym.create({ data: { userId: reviewerUserId, gymId, role: 'OWNER' } })

    // Active movement used as the parent in T2/T3
    const parent = await prisma.movement.create({
      data: { name: `Active-Parent-${TS}`, status: 'ACTIVE' },
    })
    parentMovementName = parent.name

    // Three pending movements, one per test group
    const edit = await prisma.movement.create({
      data: { name: PENDING_EDIT_ORIGINAL, status: 'PENDING' },
    })
    pendingEditId = edit.id

    const approve = await prisma.movement.create({
      data: { name: `Pending-Approve-${TS}`, status: 'PENDING' },
    })
    pendingApproveId = approve.id

    const reject = await prisma.movement.create({
      data: { name: `Pending-Reject-${TS}`, status: 'PENDING' },
    })
    pendingRejectId = reject.id

    // Suppress unused-var warnings — IDs kept for documentation
    void pendingEditId
    void pendingApproveId
    void pendingRejectId
  })

  test.afterAll(async () => {
    // Restore the reviewer's original passwordHash (null for Google OAuth users)
    await prisma.user.update({
      where: { id: reviewerUserId },
      data: { passwordHash: originalPasswordHash },
    }).catch(() => {})

    // Clean up movements created for this test run
    await prisma.movement.deleteMany({
      where: { name: { endsWith: `-${TS}` } },
    }).catch(() => {})

    await prisma.userGym.deleteMany({ where: { gymId } }).catch(() => {})
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})

    await prisma.$disconnect()
  })

  test('T1: rename a pending movement — row shows updated name after save', async ({ page }) => {
    await goToSettings(page)

    await displayRow(page, PENDING_EDIT_ORIGINAL).getByRole('button', { name: 'Edit' }).click()

    const form = editingRow(page)
    await form.locator('input').first().fill(`Renamed-E2E-${TS}`)
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator(`text=Renamed-E2E-${TS}`)).toBeVisible()
    await expect(page.locator(`text=${PENDING_EDIT_ORIGINAL}`)).not.toBeVisible()
  })

  test('T2: set parent movement via typeahead — row shows "variation of" tag', async ({ page }) => {
    await goToSettings(page)

    // After T1 the movement was renamed
    await displayRow(page, `Renamed-E2E-${TS}`).getByRole('button', { name: 'Edit' }).click()

    const form = editingRow(page)
    await form.locator('input[placeholder="Search movements…"]').fill(parentMovementName.slice(0, 8))
    await page.locator(`li:has-text("${parentMovementName}")`).click()
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator(`text=variation of ${parentMovementName}`)).toBeVisible()
  })

  test('T3: clear parent — "variation of" tag disappears after save', async ({ page }) => {
    await goToSettings(page)

    await displayRow(page, `Renamed-E2E-${TS}`).getByRole('button', { name: 'Edit' }).click()

    const form = editingRow(page)
    // The parent chip shows a × button to clear it
    await form.locator('button', { hasText: '×' }).click()
    await form.getByRole('button', { name: 'Save' }).click()

    await expect(page.locator(`text=variation of`)).not.toBeVisible()
  })

  test('T4: cancel edit — row reverts to its current state unchanged', async ({ page }) => {
    await goToSettings(page)

    await displayRow(page, `Renamed-E2E-${TS}`).getByRole('button', { name: 'Edit' }).click()

    const form = editingRow(page)
    await form.locator('input').first().fill('Should-Not-Persist')
    await form.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.locator(`text=Renamed-E2E-${TS}`)).toBeVisible()
    await expect(page.locator('text=Should-Not-Persist')).not.toBeVisible()
  })

  test('T5: approve a pending movement — row disappears from the list', async ({ page }) => {
    await goToSettings(page)

    const row = displayRow(page, `Pending-Approve-${TS}`)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Approve' }).click()

    await expect(page.locator(`text=Pending-Approve-${TS}`)).not.toBeVisible()
  })

  test('T6: reject a pending movement — row disappears from the list', async ({ page }) => {
    await goToSettings(page)

    const row = displayRow(page, `Pending-Reject-${TS}`)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Reject' }).click()

    await expect(page.locator(`text=Pending-Reject-${TS}`)).not.toBeVisible()
  })
})
