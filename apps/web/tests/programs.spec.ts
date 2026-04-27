/**
 * Playwright E2E for Programs CRUD (#82, #83) + ?programIds filter (#84).
 *
 * Each test is independent — it seeds its own gym, users, and any programs
 * it needs, and tears them down in afterEach. No describe.serial.
 *
 * Auth uses JWT cookie injection via tests/lib/auth.ts (no /login form).
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/programs.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma, type Role } from './lib/auth.js'

interface SeededFixture {
  gymId: string
  owner: { id: string; email: string }
  member: { id: string; email: string }
}

async function seedFixture(): Promise<SeededFixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `Programs E2E ${ts}`, slug: `programs-e2e-${ts}`, timezone: 'UTC' },
  })
  const owner = await prisma.user.create({
    data: { email: `prog-e2e-owner-${ts}@test.com` },
  })
  const member = await prisma.user.create({
    data: { email: `prog-e2e-member-${ts}@test.com` },
  })
  await prisma.userGym.createMany({
    data: [
      { userId: owner.id, gymId: gym.id, role: 'OWNER' },
      { userId: member.id, gymId: gym.id, role: 'MEMBER' },
    ],
  })
  return {
    gymId: gym.id,
    owner: { id: owner.id, email: owner.email },
    member: { id: member.id, email: member.email },
  }
}

async function teardown(f: SeededFixture) {
  const linked = await prisma.gymProgram.findMany({
    where: { gymId: f.gymId },
    select: { programId: true },
  })
  const programIds = linked.map((g: { programId: string }) => g.programId)
  if (programIds.length > 0) {
    await prisma.workout.updateMany({
      where: { programId: { in: programIds } },
      data: { programId: null },
    })
    await prisma.program.deleteMany({ where: { id: { in: programIds } } })
  }
  await prisma.user.deleteMany({ where: { id: { in: [f.owner.id, f.member.id] } } })
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function loginAndSelectGym(page: Page, userId: string, role: Role, gymId: string) {
  await loginAs(page.context(), userId, role)
  // Pages read gymId from localStorage on mount. Seed it before any /goto so
  // the GymContext picks the right gym immediately.
  await page.addInitScript((id) => localStorage.setItem('gymId', id), gymId)
}

test.describe('Programs CRUD E2E', () => {
  let f: SeededFixture
  test.beforeEach(async () => { f = await seedFixture() })
  test.afterEach(async () => { await teardown(f) })

  test('OWNER creates a program from the index', async ({ page }) => {
    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto('/programs')
    await page.waitForSelector('h1:has-text("Programs")')

    await page.getByRole('button', { name: /\+ New Program/ }).first().click()
    await expect(page.locator('h2', { hasText: 'New Program' })).toBeVisible()

    const name = `E2E New Program ${randomUUID().slice(0, 6)}`
    await page.fill('input[placeholder*="Override"]', name)
    await page.fill('input[type="date"] >> nth=0', '2026-05-01')
    await page.getByRole('button', { name: 'Create Program' }).click()

    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
  })

  test('OWNER renames a program', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Rename Me ${randomUUID().slice(0, 6)}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: f.gymId } },
      },
    })
    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: seeded.name })).toBeVisible()

    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.locator('h2', { hasText: 'Edit Program' })).toBeVisible()

    const newName = `E2E Renamed ${randomUUID().slice(0, 6)}`
    await page.fill('input[placeholder*="Override"]', newName)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.locator('h1', { hasText: newName })).toBeVisible({ timeout: 5000 })
  })

  test('MEMBER does not see Programs in the sidebar', async ({ page }) => {
    await loginAndSelectGym(page, f.member.id, 'MEMBER', f.gymId)
    await page.goto('/feed')
    await expect(page.locator('aside').first()).toBeVisible()
    await expect(page.locator('aside').first().getByRole('link', { name: 'Programs' })).toHaveCount(0)
  })

  test('OWNER deletes a program', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Delete Me ${randomUUID().slice(0, 6)}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: f.gymId } },
      },
    })
    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: seeded.name })).toBeVisible()

    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /Delete program/ }).click()

    await page.waitForURL('**/programs')
    await expect(page.getByText(seeded.name)).not.toBeVisible()
  })

  // ── #84: programIds filter — Open in Calendar deep-link + forbidden surface ─
  // ────────────────────────────────────────────────────────────────────────────

  test('OWNER follows "Open in Calendar" → filtered Calendar with the program header', async ({ page }) => {
    const name = `E2E Filter Calendar ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-05-01'),
        coverColor: '#10B981',
        gyms: { create: { gymId: f.gymId } },
      },
    })
    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: name })).toBeVisible()

    // Open in Calendar → /calendar?programIds=<id>
    await page.getByRole('button', { name: 'Open in Calendar' }).click()
    await page.waitForURL(`**/calendar?programIds=${seeded.id}`)

    // Filtered header shows the program name + a Calendar eyebrow.
    await expect(page.locator('h1', { hasText: name })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Calendar', { exact: true }).first()).toBeVisible()

    // "Back to full calendar" returns to the unfiltered view.
    await page.getByRole('link', { name: /Back to full calendar/ }).click()
    await page.waitForURL('**/calendar')
    await expect(page.locator('h1', { hasText: 'Calendar' })).toBeVisible()
  })

  test('OWNER visiting /feed?programIds=<inaccessible> sees an error state', async ({ page }) => {
    // Sibling gym + program this OWNER isn't a member of.
    const ts = randomUUID().slice(0, 8)
    const otherGym = await prisma.gym.create({
      data: { name: `E2E Other Gym ${ts}`, slug: `programs-e2e-other-${ts}`, timezone: 'UTC' },
    })
    const inaccessible = await prisma.program.create({
      data: {
        name: `E2E Forbidden ${ts}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: otherGym.id } },
      },
    })
    try {
      await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
      await page.goto(`/feed?programIds=${inaccessible.id}`)
      // Page renders an error message rather than crashing. The exact copy
      // comes from the API's "Forbidden" via the apiFetch error path.
      await expect(page.locator('p.text-red-400')).toBeVisible({ timeout: 5000 })
    } finally {
      await prisma.program.delete({ where: { id: inaccessible.id } }).catch(() => {})
      await prisma.gym.delete({ where: { id: otherGym.id } }).catch(() => {})
    }
  })
})
