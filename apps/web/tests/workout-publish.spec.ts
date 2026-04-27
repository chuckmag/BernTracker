/**
 * E2E for the canonical programmer publish-workout flow.
 *
 * - PROGRAMMER opens the calendar drawer on a future day, fills the form,
 *   saves as DRAFT → a pill appears in the cell.
 * - A PUBLISHED workout (seeded directly) shows up on the MEMBER's feed for
 *   that gym — proves the read side of the publish flow is wired through.
 *
 * Independent tests, JWT cookie injection.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma, type Role } from './lib/auth.js'

interface PublishFixture {
  gymId: string
  programId: string
  programmerUserId: string
  memberUserId: string
}

async function seedFixture(): Promise<PublishFixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `E2E Publish Gym ${ts}`, slug: `e2e-publish-${ts}`, timezone: 'UTC' },
  })
  const programmer = await prisma.user.create({
    data: { email: `uat-publish-prog-${ts}@test.com`, name: 'E2E Programmer' },
  })
  const member = await prisma.user.create({
    data: { email: `uat-publish-member-${ts}@test.com`, name: 'E2E Member' },
  })
  await prisma.userGym.createMany({
    data: [
      { userId: programmer.id, gymId: gym.id, role: 'PROGRAMMER' },
      { userId: member.id, gymId: gym.id, role: 'MEMBER' },
    ],
  })
  const program = await prisma.program.create({
    data: {
      name: `E2E Publish Program ${ts}`,
      startDate: new Date('2026-01-01'),
      gyms: { create: { gymId: gym.id } },
      members: {
        createMany: {
          data: [
            { userId: programmer.id, role: 'PROGRAMMER' },
            { userId: member.id, role: 'MEMBER' },
          ],
        },
      },
    },
  })
  return { gymId: gym.id, programId: program.id, programmerUserId: programmer.id, memberUserId: member.id }
}

async function teardown(f: PublishFixture) {
  await prisma.workout.deleteMany({ where: { programId: f.programId } }).catch(() => {})
  await prisma.program.delete({ where: { id: f.programId } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: { in: [f.programmerUserId, f.memberUserId] } } }).catch(() => {})
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function login(page: Page, userId: string, role: Role, gymId: string) {
  await loginAs(page.context(), userId, role)
  await page.addInitScript((id) => localStorage.setItem('gymId', id), gymId)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

async function navigateToMonth(page: Page, year: number, monthIndex: number) {
  const target = `${MONTHS[monthIndex]} ${year}`
  for (let i = 0; i < 24; i++) {
    const raw = await page.locator('span.w-44').textContent()
    const label = (raw ?? '').trim()
    if (label === target) return
    const [cm, cy] = [MONTHS.indexOf(label.split(' ')[0] ?? ''), parseInt(label.split(' ')[1] ?? '0')]
    const goForward = cy < year || (cy === year && cm < monthIndex)
    await page.click(goForward ? 'button[aria-label="Next month"]' : 'button[aria-label="Previous month"]')
    await page.waitForTimeout(120)
  }
  throw new Error(`Failed to navigate to ${target}`)
}

function cellForDay(page: Page, day: number) {
  // CalendarCell wraps in `div.group.bg-gray-950`; empty placeholder cells lack `group`.
  return page.locator('div.group.bg-gray-950').filter({
    has: page.locator('span', { hasText: new RegExp(`^${day}$`) }),
  })
}

test.describe('Programmer publish-workout E2E', () => {
  let f: PublishFixture
  test.beforeEach(async () => { f = await seedFixture() })
  test.afterEach(async () => { await teardown(f) })

  test('PROGRAMMER creates a draft workout via the calendar drawer', async ({ page }) => {
    const day = new Date(); day.setUTCHours(12, 0, 0, 0)
    day.setUTCDate(day.getUTCDate() + 21)
    const title = `Cross-Stack Created ${randomUUID().slice(0, 6)}`

    await login(page, f.programmerUserId, 'PROGRAMMER', f.gymId)
    await page.goto('/calendar')
    await page.waitForSelector('h1:has-text("Calendar")')
    await navigateToMonth(page, day.getUTCFullYear(), day.getUTCMonth())

    await cellForDay(page, day.getUTCDate()).locator('button[aria-label="Add workout"]').click()
    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()
    // Wait for the program select to enable (initial fetch).
    await expect(page.locator('select[disabled]')).not.toBeAttached({ timeout: 5000 })

    await page.fill('input[placeholder="e.g. Fran"]', title)
    await page.fill('textarea[placeholder*="Workout details"]', 'Cross-stack create')
    await page.getByRole('button', { name: 'Save as Draft' }).click()

    // Drawer overlay leaves the DOM after save.
    await expect(page.locator('div.fixed.inset-0.bg-black\\/40.z-30')).not.toBeAttached({ timeout: 5000 })
    await expect(cellForDay(page, day.getUTCDate()).getByText(title)).toBeVisible()
  })

  test('MEMBER feed shows a published workout for the gym', async ({ page }) => {
    const day = new Date(); day.setUTCHours(12, 0, 0, 0)
    day.setUTCDate(day.getUTCDate() + 5)
    const title = `Cross-Stack Published ${randomUUID().slice(0, 6)}`
    await prisma.workout.create({
      data: {
        title, description: 'Published cross-stack',
        type: 'AMRAP', status: 'PUBLISHED', scheduledAt: day,
        programId: f.programId, dayOrder: 0,
      },
    })

    await login(page, f.memberUserId, 'MEMBER', f.gymId)
    await page.goto('/feed')
    await page.waitForSelector('h1:has-text("Feed")')
    await expect(page.getByText(title)).toBeVisible({ timeout: 5000 })
  })
})
