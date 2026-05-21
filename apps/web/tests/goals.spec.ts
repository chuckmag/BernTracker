/**
 * E2E for the goals web feature (#433).
 *
 * Covers the cross-stack flows that matter end-to-end — creation of all
 * three goal types, status transitions (mark complete, archive), edit
 * inline, and the cross-user 403 boundary. Anything that's pure UI
 * rendering belongs in the unit tests under src/**.
 *
 * Each test seeds its own user (and movement when needed) via Prisma and
 * tears down in afterEach. Auth via JWT cookie injection from
 * tests/lib/auth.ts.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface Fixture {
  userId: string
  email: string
  movementId: string
}

async function seedFixture(): Promise<Fixture> {
  const ts = randomUUID().slice(0, 8)
  const user = await prisma.user.create({
    data: { email: `e2e-goals-${ts}@test.com`, name: 'E2E Goals User' },
  })
  // Use a stable shared movement so we don't pollute the catalog. The
  // member-log-result spec also relies on Back Squat — upsert is safe.
  const backSquat = await prisma.movement.upsert({
    where: { name: 'Back Squat' },
    create: { name: 'Back Squat', status: 'ACTIVE' },
    update: {},
  })
  return { userId: user.id, email: user.email, movementId: backSquat.id }
}

async function teardown(f: Fixture) {
  await prisma.goal.deleteMany({ where: { userId: f.userId } }).catch(() => {})
  await prisma.user.delete({ where: { id: f.userId } }).catch(() => {})
}

async function loginGoalsUser(page: Page, f: Fixture) {
  await loginAs(page.context(), f.userId, 'MEMBER')
}

test.describe('Goals web E2E', () => {
  let f: Fixture
  test.beforeEach(async () => { f = await seedFixture() })
  test.afterEach(async () => { await teardown(f) })

  test('T1: Create a PR Target goal — appears on dashboard card + /goals page', async ({ page }) => {
    await loginGoalsUser(page, f)
    await page.goto('/goals')
    await page.waitForSelector('h1:has-text("Goals")')

    await page.getByRole('button', { name: /\+ New goal/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel(/^Title$/).fill('Hit 315 back squat E2E')
    await page.getByLabel(/^Movement$/).selectOption({ label: 'Back Squat' })
    await page.getByLabel(/^Target$/).fill('315')
    await page.getByRole('button', { name: /Create goal/i }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Hit 315 back squat E2E')).toBeVisible()
    // Dashboard right rail also shows the new goal.
    await page.goto('/dashboard')
    await expect(page.getByText('Hit 315 back squat E2E')).toBeVisible()
  })

  test('T2: Create a Frequency goal — progress label shows logged/required', async ({ page }) => {
    await loginGoalsUser(page, f)
    await page.goto('/goals')
    await page.waitForSelector('h1:has-text("Goals")')

    await page.getByRole('button', { name: /\+ New goal/i }).first().click()
    await page.getByLabel(/^Type$/).selectOption('FREQUENCY')
    await page.getByLabel(/^Title$/).fill('Train 3×/wk E2E')
    await page.getByLabel(/^Workouts \/ week$/).fill('3')
    await page.getByLabel(/^For how many weeks$/).fill('2')
    await page.getByRole('button', { name: /Create goal/i }).click()

    await expect(page.getByText('Train 3×/wk E2E')).toBeVisible()
    // Initial progress: 0/6 workouts (3 × 2).
    await expect(page.getByText(/0 \/ 6 workouts/)).toBeVisible()
  })

  test('T3: Create a Habit goal — Mark complete flips it to the Completed tab', async ({ page }) => {
    await loginGoalsUser(page, f)
    await page.goto('/goals')
    await page.waitForSelector('h1:has-text("Goals")')

    await page.getByRole('button', { name: /\+ New goal/i }).first().click()
    await page.getByLabel(/^Type$/).selectOption('HABIT')
    await page.getByLabel(/^Title$/).fill('Sign up for the Open E2E')
    await page.getByRole('button', { name: /Create goal/i }).click()

    await expect(page.getByText('Sign up for the Open E2E')).toBeVisible()
    // Drill into the detail page.
    await page.getByText('Sign up for the Open E2E').click()
    await page.waitForURL(/\/goals\/[^/]+$/)
    await page.getByRole('button', { name: 'Mark complete' }).click()
    await expect(page.getByRole('button', { name: 'Mark active' })).toBeVisible()

    // Back to the list — goal should now live in the Completed tab.
    await page.goto('/goals')
    await page.getByRole('tab', { name: 'Completed' }).click()
    await expect(page.getByText('Sign up for the Open E2E')).toBeVisible()
    await page.getByRole('tab', { name: 'Active' }).click()
    await expect(page.getByText('Sign up for the Open E2E')).toHaveCount(0)
  })

  test('T5: Edit goal title inline from the detail page', async ({ page }) => {
    // Seed a goal directly so the test isn't gated on T1's create flow.
    const goal = await prisma.goal.create({
      data: {
        userId: f.userId,
        type: 'HABIT',
        status: 'ACTIVE',
        title: 'Original title E2E',
      },
    })
    await loginGoalsUser(page, f)
    await page.goto(`/goals/${goal.id}`)
    await page.waitForSelector('h1')

    await page.getByRole('button', { name: 'Goal actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit' }).click()
    const titleInput = page.getByLabel('Title')
    await titleInput.fill('Renamed E2E')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: 'Renamed E2E' })).toBeVisible()
  })

  test('T6: Archive a goal — moves to the Archived tab', async ({ page }) => {
    const goal = await prisma.goal.create({
      data: {
        userId: f.userId,
        type: 'HABIT',
        status: 'ACTIVE',
        title: 'Archive-me E2E',
      },
    })
    await loginGoalsUser(page, f)
    await page.goto(`/goals/${goal.id}`)
    await page.waitForSelector('h1')

    await page.getByRole('button', { name: 'Goal actions' }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()

    await page.goto('/goals')
    // Archived tab carries the goal; Active does not.
    await page.getByRole('tab', { name: 'Archived' }).click()
    await expect(page.getByText('Archive-me E2E')).toBeVisible()
    await page.getByRole('tab', { name: 'Active' }).click()
    await expect(page.getByText('Archive-me E2E')).toHaveCount(0)
  })

  test('T7: Member cannot navigate to another user\'s goal detail (403)', async ({ page }) => {
    // Seed a second user with a goal; the test's own user shouldn't be able to read it.
    const otherTs = randomUUID().slice(0, 8)
    const other = await prisma.user.create({
      data: { email: `e2e-goals-other-${otherTs}@test.com`, name: 'Other User' },
    })
    const otherGoal = await prisma.goal.create({
      data: {
        userId: other.id,
        type: 'HABIT',
        status: 'ACTIVE',
        title: 'Other user goal E2E',
      },
    })
    await loginGoalsUser(page, f)
    await page.goto(`/goals/${otherGoal.id}`)
    await expect(page.getByText(/don't have access/i)).toBeVisible({ timeout: 5000 })

    await prisma.goal.delete({ where: { id: otherGoal.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: other.id } }).catch(() => {})
  })
})
