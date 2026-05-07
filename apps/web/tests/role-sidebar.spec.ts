/**
 * Role-gated sidebar E2E.
 *
 * Each role's gymId+role combination drives whether the staff section appears.
 * Driven from the live API+web stack so we catch any regression in
 * GymContext (which fetches /api/me/gyms to compute the active gymRole).
 *
 * Independent tests, JWT cookie injection.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma, type Role } from './lib/auth.js'

interface UserGymFixture { gymId: string; userId: string }

async function seedUserInGym(role: Role): Promise<UserGymFixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `E2E Role Gym ${ts}`, slug: `e2e-role-${ts}`, timezone: 'UTC' },
  })
  const user = await prisma.user.create({ data: { email: `uat-role-${role.toLowerCase()}-${ts}@test.com` } })
  await prisma.userGym.create({ data: { userId: user.id, gymId: gym.id, role } })
  return { gymId: gym.id, userId: user.id }
}

async function teardown(f: UserGymFixture) {
  await prisma.userGym.deleteMany({ where: { gymId: f.gymId } }).catch(() => {})
  await prisma.user.delete({ where: { id: f.userId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function loginAndOpenFeed(page: Page, f: UserGymFixture, role: Role) {
  await loginAs(page.context(), f.userId, role)
  await page.addInitScript((id) => localStorage.setItem('gymId', id), f.gymId)
  await page.goto('/feed')
  await page.waitForSelector('h1:has-text("Feed")')
}

// 'Members' was consolidated into /gym-settings#members; no standalone sidebar link.
// Calendar is member-visible since #268 (unified calendar for all roles).
const STAFF_LINKS = ['Programs', 'Gym Settings'] as const
const MEMBER_LINKS = ['Feed', 'Calendar', 'History'] as const

test.describe('Sidebar role gating E2E', () => {
  test('MEMBER sees Feed + History only — no staff section', async ({ page }) => {
    const f = await seedUserInGym('MEMBER')
    try {
      await loginAndOpenFeed(page, f, 'MEMBER')
      const aside = page.locator('aside').first()
      for (const label of MEMBER_LINKS) {
        await expect(aside.getByRole('link', { name: label, exact: true })).toBeVisible()
      }
      for (const label of STAFF_LINKS) {
        await expect(aside.getByRole('link', { name: label, exact: true })).toHaveCount(0)
      }
    } finally { await teardown(f) }
  })

  test('PROGRAMMER sees Feed + History + the full staff section', async ({ page }) => {
    const f = await seedUserInGym('PROGRAMMER')
    try {
      await loginAndOpenFeed(page, f, 'PROGRAMMER')
      const aside = page.locator('aside').first()
      for (const label of [...MEMBER_LINKS, ...STAFF_LINKS]) {
        await expect(aside.getByRole('link', { name: label, exact: true })).toBeVisible()
      }
    } finally { await teardown(f) }
  })

  test('OWNER sees Feed + History + the full staff section', async ({ page }) => {
    const f = await seedUserInGym('OWNER')
    try {
      await loginAndOpenFeed(page, f, 'OWNER')
      const aside = page.locator('aside').first()
      for (const label of [...MEMBER_LINKS, ...STAFF_LINKS]) {
        await expect(aside.getByRole('link', { name: label, exact: true })).toBeVisible()
      }
    } finally { await teardown(f) }
  })
})
