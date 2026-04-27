/**
 * Playwright E2E for Slice 1 + Slice 2 of #82 — Programs CRUD + ?programId filter.
 *
 * Covers:
 *   T1: OWNER can create a program from the index page (#83)
 *   T2: OWNER can edit a program's name (#83)
 *   T3: MEMBER role does not see Programs in the sidebar (#83)
 *   T4: OWNER can delete a program and it disappears from the index (#83)
 *   T5: PROGRAMMER follows "Open in Calendar" → filtered Calendar with header (#84)
 *   T6: Direct visit to /feed?programId=<unrelated-program> surfaces an error (#84)
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test tests/programs.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Shared state ─────────────────────────────────────────────────────────────

const TS = randomUUID().slice(0, 8)
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
  await page.waitForURL('**/dashboard', { waitUntil: 'commit' })
  await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)
}

async function gotoPrograms(page: Page) {
  await page.goto('/programs')
  await page.waitForSelector('h1:has-text("Programs")')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Programs CRUD + ?programId filter (#83 + #84)', () => {
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
    // T6 creates a sibling gym + program — clean those up too
    await prisma.gym.deleteMany({ where: { slug: { startsWith: `programs-e2e-other-${TS}` } } }).catch(() => {})
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

  // ── T5: Open in Calendar from program detail ────────────────────────────────

  test('T5: PROGRAMMER follows "Open in Calendar" → filtered Calendar header', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Filter Calendar ${TS}`,
        startDate: new Date('2026-05-01'),
        coverColor: '#10B981',
        gyms: { create: { gymId } },
      },
    })

    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: `E2E Filter Calendar ${TS}` })).toBeVisible()

    // Click "Open in Calendar" — opens /calendar?programIds=<seeded.id>
    await page.getByRole('button', { name: 'Open in Calendar' }).click()
    await page.waitForURL(`**/calendar?programIds=${seeded.id}`)

    // Filtered header shows the program name + the "Calendar" eyebrow
    await expect(page.locator('h1', { hasText: `E2E Filter Calendar ${TS}` })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Calendar', { exact: true }).first()).toBeVisible()

    // Back link returns to the unfiltered calendar
    await page.getByRole('link', { name: /Back to full calendar/ }).click()
    await page.waitForURL('**/calendar')
    await expect(page.locator('h1', { hasText: 'Calendar' })).toBeVisible()
  })

  // ── T6: Forbidden program surfaces error on Feed ────────────────────────────

  test('T6: /feed?programId=<unrelated-program> renders an error state', async ({ page }) => {
    // Create a sibling gym + program that this test's OWNER isn't a member of.
    const otherGym = await prisma.gym.create({
      data: { name: `E2E Other Gym ${TS}`, slug: `programs-e2e-other-${TS}`, timezone: 'UTC' },
    })
    const inaccessibleProgram = await prisma.program.create({
      data: {
        name: `E2E Forbidden ${TS}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: otherGym.id } },
      },
    })

    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto(`/feed?programIds=${inaccessibleProgram.id}`)

    // The page should render an error message rather than crashing.
    // The exact copy comes from the API ("Forbidden") via the apiFetch error path.
    await expect(page.locator('p.text-red-400')).toBeVisible({ timeout: 5000 })

    // Cleanup of these specific fixtures (afterAll catches the gym/program too).
    await prisma.program.delete({ where: { id: inaccessibleProgram.id } }).catch(() => {})
    await prisma.gym.delete({ where: { id: otherGym.id } }).catch(() => {})
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

  // ── T7: Member invite + remove roundtrip (slice 3) ───────────────────────────

  test('T7: OWNER invites a gym member onto a program then removes them', async ({ page }) => {
    const seeded = await prisma.program.create({
      data: {
        name: `E2E Membership ${TS}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId } },
      },
    })

    await login(page, OWNER_EMAIL, OWNER_PASSWORD)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: `E2E Membership ${TS}` })).toBeVisible()

    // Click the Members tab (button with text "members" — note lowercase
    // since CSS capitalizes it).
    await page.getByRole('button', { name: /^members/i }).click()

    // Empty state — invite member
    await page.getByRole('button', { name: 'Invite members' }).first().click()

    // Pick the seeded MEMBER user
    await page.getByLabel('Search gym members').fill(MEMBER_EMAIL)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: /Invite 1 member/ }).click()

    // Member's row appears
    await expect(page.getByText(MEMBER_EMAIL)).toBeVisible({ timeout: 5000 })

    // Remove via the row's button
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Remove' }).first().click()

    await expect(page.getByText(MEMBER_EMAIL)).not.toBeVisible({ timeout: 5000 })

    // Cleanup
    await prisma.userProgram.deleteMany({ where: { programId: seeded.id } }).catch(() => {})
  })

  // ── T8: COACH sees Members tab read-only ────────────────────────────────────

  test('T8: COACH sees the Members tab without invite/remove controls', async ({ page }) => {
    // Seed a coach user + a program with one member
    const coachHash = await bcrypt.hash('TestPass1!', 10)
    const coach = await prisma.user.create({ data: { email: `prog-e2e-coach-${TS}@test.com`, passwordHash: coachHash } })
    await prisma.userGym.create({ data: { userId: coach.id, gymId, role: 'COACH' } })

    const seeded = await prisma.program.create({
      data: {
        name: `E2E Coach View ${TS}`,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId } },
      },
    })
    await prisma.userProgram.create({ data: { userId: memberUserId, programId: seeded.id, role: 'MEMBER' } })

    await login(page, `prog-e2e-coach-${TS}@test.com`, 'TestPass1!')
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: `E2E Coach View ${TS}` })).toBeVisible()

    await page.getByRole('button', { name: /^members/i }).click()

    // Roster row visible
    await expect(page.getByText(MEMBER_EMAIL)).toBeVisible({ timeout: 5000 })
    // Read-only — no Invite or Remove buttons
    await expect(page.getByRole('button', { name: 'Invite members' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)

    // Cleanup the coach + their userGym/userProgram (afterAll cleans the rest)
    await prisma.userProgram.deleteMany({ where: { programId: seeded.id } }).catch(() => {})
    await prisma.userGym.delete({ where: { userId_gymId: { userId: coach.id, gymId } } }).catch(() => {})
    await prisma.user.delete({ where: { id: coach.id } }).catch(() => {})
  })
})
