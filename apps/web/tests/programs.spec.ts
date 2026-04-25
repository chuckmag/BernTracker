/**
 * Playwright E2E for Slice 1 of #82 — Programs CRUD (staff).
 *
 * Covers:
 *   T1: OWNER can create a program from the index page
 *   T2: OWNER can edit a program's name
 *   T3: MEMBER role does not see Programs in the sidebar
 *   T4: OWNER can delete a program and it disappears from the index
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test tests/programs.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'module'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Shared state ─────────────────────────────────────────────────────────────

const TS = Date.now()
const OWNER_EMAIL = `prog-e2e-owner-${TS}@test.com`
const OWNER_PASSWORD = 'TestPass1!'
const MEMBER_EMAIL = `prog-e2e-member-${TS}@test.com`
const MEMBER_PASSWORD = 'TestPass1!'

let gymId = ''
let ownerUserId = ''
let memberUserId = ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
  await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)
}

async function gotoPrograms(page: Page) {
  await page.goto('/programs')
  await page.waitForSelector('h1:has-text("Programs")')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Programs CRUD UAT (#83)', () => {
  test.beforeAll(async () => {
    const [ownerHash, memberHash] = await Promise.all([
      bcrypt.hash(OWNER_PASSWORD, 10),
      bcrypt.hash(MEMBER_PASSWORD, 10),
    ])

    const gym = await prisma.gym.create({
      data: { name: `Programs E2E ${TS}`, slug: `programs-e2e-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id

    const [owner, member] = await Promise.all([
      prisma.user.create({ data: { email: OWNER_EMAIL, passwordHash: ownerHash } }),
      prisma.user.create({ data: { email: MEMBER_EMAIL, passwordHash: memberHash } }),
    ])
    ownerUserId = owner.id
    memberUserId = member.id

    await prisma.userGym.createMany({
      data: [
        { userId: ownerUserId, gymId, role: 'OWNER' },
        { userId: memberUserId, gymId, role: 'MEMBER' },
      ],
    })
  })

  test.afterAll(async () => {
    // Remove any programs left over from failed tests
    const linked = await prisma.gymProgram.findMany({ where: { gymId }, select: { programId: true } })
    const programIds = linked.map((g: { programId: string }) => g.programId)
    if (programIds.length > 0) {
      await prisma.workout.updateMany({ where: { programId: { in: programIds } }, data: { programId: null } })
      await prisma.program.deleteMany({ where: { id: { in: programIds } } })
    }
    await prisma.user.deleteMany({ where: { id: { in: [ownerUserId, memberUserId] } } })
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
    await prisma.$disconnect()
  })

  // ── T1: OWNER creates a program ──────────────────────────────────────────────

  test('T1: OWNER can create a program from the index', async ({ page }) => {
    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await gotoPrograms(page)

    // Empty-state CTA also works; click the header button for explicitness
    await page.getByRole('button', { name: /\+ New Program/ }).first().click()

    await expect(page.locator('h2', { hasText: 'New Program' })).toBeVisible()

    const programName = `E2E Program T1 ${TS}`
    await page.fill('input[placeholder*="Override"]', programName)
    await page.fill('input[type="date"] >> nth=0', '2026-05-01')
    await page.getByRole('button', { name: 'Create Program' }).click()

    // Card with the new program name appears on the index
    await expect(page.getByText(programName)).toBeVisible({ timeout: 5000 })
  })

  // ── T2: OWNER edits a program ────────────────────────────────────────────────

  test('T2: OWNER can rename a program', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Rename Me ${TS}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId } },
      },
    })

    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: `E2E Rename Me ${TS}` })).toBeVisible()

    await page.getByRole('button', { name: 'Edit' }).click()
    await expect(page.locator('h2', { hasText: 'Edit Program' })).toBeVisible()

    const newName = `E2E Renamed ${TS}`
    await page.fill('input[placeholder*="Override"]', newName)
    await page.getByRole('button', { name: 'Save Changes' }).click()

    await expect(page.locator('h1', { hasText: newName })).toBeVisible({ timeout: 5000 })
  })

  // ── T3: MEMBER does not see Programs in sidebar ─────────────────────────────

  test('T3: MEMBER does not see Programs in the sidebar', async ({ page }) => {
    await login(page, MEMBER_EMAIL, MEMBER_PASSWORD)
    await page.goto('/feed')
    // Feed is the landing page for members
    await expect(page.locator('aside').first()).toBeVisible()
    await expect(page.locator('aside').first().getByRole('link', { name: 'Programs' })).toHaveCount(0)
  })

  // ── T4: OWNER deletes a program ──────────────────────────────────────────────

  test('T4: OWNER can delete a program', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Delete Me ${TS}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId } },
      },
    })

    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: `E2E Delete Me ${TS}` })).toBeVisible()

    // window.confirm auto-accept so the test doesn't stall
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: /Delete program/ }).click()

    // Land back on the Programs index
    await page.waitForURL('**/programs')
    await expect(page.getByText(`E2E Delete Me ${TS}`)).not.toBeVisible()
  })
})
