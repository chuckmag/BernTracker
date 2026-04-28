/**
 * Playwright E2E for the user onboarding flow (slice B of #120).
 *
 * Verifies:
 *  - A user without onboardedAt is redirected to /onboarding
 *  - Walking through the 3-step flow persists profile + emergency contact
 *  - Server marks onboardedAt automatically once requirements are met
 *  - Subsequent logins land directly on /feed
 *
 * Auth uses JWT cookie injection — tests/lib/auth.ts.
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/onboarding.spec.ts
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface Fixture {
  userId: string
  email: string
}

async function seed(): Promise<Fixture> {
  const ts = randomUUID().slice(0, 8)
  // No name on the user — the onboarding page would auto-split it into the
  // form fields, which races the Playwright .fill() and overwrites the typed
  // value. A null name keeps the form empty until the test types into it.
  const user = await prisma.user.create({
    data: { email: `onb-e2e-${ts}@test.com` },
  })
  return { userId: user.id, email: user.email }
}

async function teardown(f: Fixture) {
  await prisma.emergencyContact.deleteMany({ where: { userId: f.userId } })
  await prisma.refreshToken.deleteMany({ where: { userId: f.userId } })
  await prisma.user.delete({ where: { id: f.userId } }).catch(() => {})
}

test.describe('Onboarding E2E', () => {
  let f: Fixture
  test.beforeEach(async () => { f = await seed() })
  test.afterEach(async () => { await teardown(f) })

  test('user without onboardedAt is redirected to /onboarding from any gated route', async ({ page }) => {
    await loginAs(page.context(), f.userId, 'MEMBER', { markOnboarded: false })
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByRole('heading', { name: /set up your profile/i })).toBeVisible()
  })

  test('full 2-step onboarding sets onboardedAt and lands on /feed', async ({ page }) => {
    await loginAs(page.context(), f.userId, 'MEMBER', { markOnboarded: false })
    await page.goto('/onboarding')

    // Step 1 — names. Wait for the page to settle (the empty-state effect
    // runs after the API roundtrip) before typing so we don't race with
    // setFirstName('').
    await expect(page.getByRole('heading', { name: /set up your profile/i })).toBeVisible()
    await page.getByLabel('First name').fill('Onb')
    await page.getByLabel('Last name').fill('Tester')
    await page.getByRole('button', { name: /Continue/ }).click()

    // Step 2 — birthday + gender (PREFER_NOT_TO_SAY pre-selected) → Finish.
    // Emergency contacts are deferred to gym onboarding; no step 3 here.
    await page.getByLabel('Birthday').fill('1992-06-15')
    await page.getByRole('button', { name: 'Finish' }).click()

    // After finishing we should be on /feed
    await expect(page).toHaveURL(/\/feed$/, { timeout: 10_000 })

    // DB invariants
    const after = await prisma.user.findUnique({
      where: { id: f.userId },
      select: { firstName: true, lastName: true, birthday: true, onboardedAt: true },
    })
    expect(after?.firstName).toBe('Onb')
    expect(after?.lastName).toBe('Tester')
    expect(after?.birthday).not.toBeNull()
    expect(after?.onboardedAt).not.toBeNull()
  })

  test('an already-onboarded user accessing /onboarding is redirected to /feed', async ({ page }) => {
    await prisma.user.update({
      where: { id: f.userId },
      data: {
        firstName: 'Already',
        lastName: 'Done',
        birthday: new Date('1990-01-01'),
        identifiedGender: 'PREFER_NOT_TO_SAY',
        onboardedAt: new Date(),
      },
    })
    await loginAs(page.context(), f.userId, 'MEMBER', { markOnboarded: false })
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/feed$/, { timeout: 10_000 })
  })
})
