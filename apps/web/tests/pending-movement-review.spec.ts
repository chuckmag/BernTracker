/**
 * Playwright E2E for the pending-movement reviewer flow (#72).
 *
 * Each test is independent — it seeds its own pending movement (and parent,
 * where needed) and tears down after itself. No describe.serial.
 *
 * Auth uses JWT cookie injection via tests/lib/auth.ts. The reviewer is one
 * of the env-configured `WODALYTICS_ADMIN_EMAILS` users (the API checks email
 * against the admin allowlist, not a role, so any token signed for that user
 * passes the reviewer guard).
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/pending-movement-review.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface ReviewerFixture {
  reviewerUserId: string
  gymId: string
}

async function seedReviewerAndGym(): Promise<ReviewerFixture> {
  const raw = process.env.WODALYTICS_ADMIN_EMAILS
  if (!raw) throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env')
  const reviewerEmail = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)[0]
  if (!reviewerEmail) throw new Error('WODALYTICS_ADMIN_EMAILS parsed to empty list')

  const reviewer = await prisma.user.findUnique({ where: { email: reviewerEmail } })
  if (!reviewer) throw new Error(`Reviewer user not found: ${reviewerEmail}`)

  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `E2E Review Gym ${ts}`, slug: `e2e-review-gym-${ts}`, timezone: 'UTC' },
  })
  await prisma.userGym.create({ data: { userId: reviewer.id, gymId: gym.id, role: 'OWNER' } })
  return { reviewerUserId: reviewer.id, gymId: gym.id }
}

async function teardownReviewerFixture(f: ReviewerFixture) {
  await prisma.userGym.deleteMany({ where: { gymId: f.gymId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function gotoSettings(page: Page, f: ReviewerFixture) {
  await loginAs(page.context(), f.reviewerUserId, 'OWNER')
  await page.addInitScript((id) => localStorage.setItem('gymId', id), f.gymId)
  // Pending-movement review moved out of /gym-settings into the Movements
  // tab of /admin/settings. Hash anchor selects the tab on mount.
  await page.goto('/admin/settings#movements')
  await page.waitForSelector('h2:has-text("Pending Movements")')
}

function displayRow(page: Page, name: string) {
  return page.locator('div.bg-gray-900').filter({ hasText: name }).filter({
    has: page.getByRole('button', { name: 'Edit' }),
  })
}

function editingRow(page: Page) {
  return page.locator('div.bg-gray-900').filter({
    has: page.getByRole('button', { name: 'Save' }),
  })
}

test.describe('Pending movement reviewer E2E (#72)', () => {
  let f: ReviewerFixture
  test.beforeEach(async () => { f = await seedReviewerAndGym() })
  test.afterEach(async () => { await teardownReviewerFixture(f) })

  test('rename a pending movement persists after save', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const original = `Pending-Edit-${ts}`
    const renamed = `Renamed-E2E-${ts}`
    const m = await prisma.movement.create({ data: { name: original, status: 'PENDING' } })

    try {
      await gotoSettings(page, f)
      await displayRow(page, original).getByRole('button', { name: 'Edit' }).click()

      const form = editingRow(page)
      await form.locator('input').first().fill(renamed)
      await form.getByRole('button', { name: 'Save' }).click()

      await expect(page.locator(`text=${renamed}`)).toBeVisible()
      await expect(page.locator(`text=${original}`)).not.toBeVisible()
    } finally {
      await prisma.movement.delete({ where: { id: m.id } }).catch(() => {})
    }
  })

  test('set parent movement via typeahead shows "variation of" tag', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const parentName = `Active-Parent-${ts}`
    const childName = `Pending-Child-${ts}`
    const parent = await prisma.movement.create({ data: { name: parentName, status: 'ACTIVE' } })
    const child = await prisma.movement.create({ data: { name: childName, status: 'PENDING' } })

    try {
      await gotoSettings(page, f)
      await displayRow(page, childName).getByRole('button', { name: 'Edit' }).click()

      const form = editingRow(page)
      await form.locator('input[placeholder="Search movements…"]').fill(parentName.slice(0, 8))
      await page.locator(`li:has-text("${parentName}")`).click()
      await form.getByRole('button', { name: 'Save' }).click()

      await expect(page.locator(`text=variation of ${parentName}`)).toBeVisible()
    } finally {
      await prisma.movement.deleteMany({ where: { id: { in: [parent.id, child.id] } } }).catch(() => {})
    }
  })

  test('clear parent removes "variation of" tag', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const parentName = `Active-Parent-${ts}`
    const childName = `Pending-Child-${ts}`
    const parent = await prisma.movement.create({ data: { name: parentName, status: 'ACTIVE' } })
    const child = await prisma.movement.create({
      data: { name: childName, status: 'PENDING', parentId: parent.id },
    })

    try {
      await gotoSettings(page, f)
      await displayRow(page, childName).getByRole('button', { name: 'Edit' }).click()

      const form = editingRow(page)
      await form.locator('button', { hasText: '×' }).click()
      await form.getByRole('button', { name: 'Save' }).click()

      await expect(page.locator(`text=variation of ${parentName}`)).not.toBeVisible()
    } finally {
      await prisma.movement.deleteMany({ where: { id: { in: [parent.id, child.id] } } }).catch(() => {})
    }
  })

  test('cancel edit reverts the row unchanged', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const original = `Pending-Cancel-${ts}`
    const m = await prisma.movement.create({ data: { name: original, status: 'PENDING' } })

    try {
      await gotoSettings(page, f)
      await displayRow(page, original).getByRole('button', { name: 'Edit' }).click()

      const form = editingRow(page)
      await form.locator('input').first().fill('Should-Not-Persist')
      await form.getByRole('button', { name: 'Cancel' }).click()

      await expect(page.locator(`text=${original}`)).toBeVisible()
      await expect(page.locator('text=Should-Not-Persist')).not.toBeVisible()
    } finally {
      await prisma.movement.delete({ where: { id: m.id } }).catch(() => {})
    }
  })

  test('approving a pending movement removes it from the list', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const name = `Pending-Approve-${ts}`
    const m = await prisma.movement.create({ data: { name, status: 'PENDING' } })

    try {
      await gotoSettings(page, f)
      const row = displayRow(page, name)
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: 'Approve' }).click()

      await expect(page.locator(`text=${name}`)).not.toBeVisible()
    } finally {
      await prisma.movement.delete({ where: { id: m.id } }).catch(() => {})
    }
  })

  test('rejecting a pending movement removes it from the list', async ({ page }) => {
    const ts = randomUUID().slice(0, 8)
    const name = `Pending-Reject-${ts}`
    const m = await prisma.movement.create({ data: { name, status: 'PENDING' } })

    try {
      await gotoSettings(page, f)
      const row = displayRow(page, name)
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: 'Reject' }).click()

      await expect(page.locator(`text=${name}`)).not.toBeVisible()
    } finally {
      await prisma.movement.delete({ where: { id: m.id } }).catch(() => {})
    }
  })
})
