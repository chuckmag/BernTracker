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
    // exact: true — slice 4 added a "Browse Programs" link visible to all roles,
    // so the substring-match would falsely succeed.
    await expect(page.locator('aside').first().getByRole('link', { name: 'Programs', exact: true })).toHaveCount(0)
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

  // ── #85: Members tab — invite + remove roundtrip ───────────────────────────
  // ────────────────────────────────────────────────────────────────────────────

  test('OWNER invites a gym member onto a program then removes them', async ({ page }) => {
    const name = `E2E Membership ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: f.gymId } },
      },
    })
    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: name })).toBeVisible()

    // The Members tab — text capitalized via CSS, accessible name is "members".
    await page.getByRole('button', { name: /^members/i }).click()
    await page.getByRole('button', { name: 'Invite members' }).first().click()

    // Pick the seeded MEMBER user, submit the batch.
    // Scope to the row containing the member's email — the page also renders
    // the (closed) ProgramFormDrawer, whose disabled "Set as gym default"
    // checkbox would otherwise be the .first() match.
    await page.getByLabel('Search gym members').fill(f.member.email)
    const memberRow = page.locator('label', { hasText: f.member.email })
    await memberRow.getByRole('checkbox').check()
    await page.getByRole('button', { name: /Invite 1 member/ }).click()

    // Member's row appears in the roster
    await expect(page.getByText(f.member.email)).toBeVisible({ timeout: 5000 })

    // Remove via the row's button — window.confirm auto-accept
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Remove' }).first().click()
    await expect(page.getByText(f.member.email)).not.toBeVisible({ timeout: 5000 })
  })

  test('COACH sees the Members tab without invite/remove controls', async ({ page }) => {
    // Seed a coach user + a program where the existing seeded MEMBER is subscribed.
    const coach = await prisma.user.create({
      data: { email: `prog-e2e-coach-${randomUUID().slice(0, 6)}@test.com` },
    })
    await prisma.userGym.create({ data: { userId: coach.id, gymId: f.gymId, role: 'COACH' } })

    const name = `E2E Coach View ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-05-01'),
        gyms: { create: { gymId: f.gymId } },
        members: { create: { userId: f.member.id, role: 'MEMBER' } },
      },
    })
    try {
      await loginAndSelectGym(page, coach.id, 'COACH', f.gymId)
      await page.goto(`/programs/${seeded.id}`)
      await expect(page.locator('h1', { hasText: name })).toBeVisible()

      await page.getByRole('button', { name: /^members/i }).click()

      // Roster row visible
      await expect(page.getByText(f.member.email)).toBeVisible({ timeout: 5000 })
      // Read-only — neither Invite nor Remove present
      await expect(page.getByRole('button', { name: 'Invite members' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)
    } finally {
      // afterEach handles f.gymId's programs; the coach is on a separate user row.
      await prisma.userProgram.deleteMany({ where: { programId: seeded.id } }).catch(() => {})
      await prisma.userGym.delete({
        where: { userId_gymId: { userId: coach.id, gymId: f.gymId } },
      }).catch(() => {})
      await prisma.user.delete({ where: { id: coach.id } }).catch(() => {})
    }
  })

  // ── #87: visibility + Browse + self-subscribe ──────────────────────────────
  // ────────────────────────────────────────────────────────────────────────────

  test('MEMBER joins a PUBLIC program from Browse and lands on its filtered Feed', async ({ page }) => {
    const name = `E2E Browse Public ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-06-01'),
        visibility: 'PUBLIC',
        coverColor: '#10B981',
        gyms: { create: { gymId: f.gymId } },
      },
    })

    await loginAndSelectGym(page, f.member.id, 'MEMBER', f.gymId)
    await page.goto('/browse-programs')
    await expect(page.locator('h1', { hasText: 'Browse programs' })).toBeVisible()

    // The seeded PUBLIC program is gym-affiliated, so it shows in the
    // "From your gym" section. Scope the Join click there — the unaffiliated
    // "Public programs" section above also renders Join buttons.
    await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'From your gym' }) })
      .getByRole('button', { name: 'Join' })
      .click()

    // Lands on /feed (program filter set to the joined program by the page)
    await page.waitForURL('**/feed**')

    // The UserProgram row should now exist
    const sub = await prisma.userProgram.findUnique({
      where: { userId_programId: { userId: f.member.id, programId: seeded.id } },
    })
    expect(sub).not.toBeNull()
  })

  test('Browse hides PRIVATE programs and programs the user already joined', async ({ page }) => {
    const ts = randomUUID().slice(0, 6)
    const publicProgram = await prisma.program.create({
      data: { name: `E2E Public ${ts}`, startDate: new Date('2026-06-01'), visibility: 'PUBLIC', gyms: { create: { gymId: f.gymId } } },
    })
    const privateProgram = await prisma.program.create({
      data: { name: `E2E Private ${ts}`, startDate: new Date('2026-06-01'), visibility: 'PRIVATE', gyms: { create: { gymId: f.gymId } } },
    })
    const alreadyJoined = await prisma.program.create({
      data: { name: `E2E Already Joined ${ts}`, startDate: new Date('2026-06-01'), visibility: 'PUBLIC', gyms: { create: { gymId: f.gymId } } },
    })
    await prisma.userProgram.create({ data: { userId: f.member.id, programId: alreadyJoined.id, role: 'MEMBER' } })

    try {
      await loginAndSelectGym(page, f.member.id, 'MEMBER', f.gymId)
      await page.goto('/browse-programs')
      await expect(page.getByText(publicProgram.name)).toBeVisible({ timeout: 5000 })
      await expect(page.getByText(privateProgram.name)).not.toBeVisible()
      await expect(page.getByText(alreadyJoined.name)).not.toBeVisible()
    } finally {
      await prisma.userProgram.deleteMany({ where: { programId: { in: [publicProgram.id, privateProgram.id, alreadyJoined.id] } } }).catch(() => {})
    }
  })

  // ── #88: default program + auto-surface for members ────────────────────────
  // ────────────────────────────────────────────────────────────────────────────

  test('OWNER marks a PUBLIC program as gym default and the badge appears', async ({ page }) => {
    const name = `E2E Default ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-07-01'),
        visibility: 'PUBLIC',
        gyms: { create: { gymId: f.gymId } },
      },
    })

    await loginAndSelectGym(page, f.owner.id, 'OWNER', f.gymId)
    await page.goto(`/programs/${seeded.id}`)
    await expect(page.locator('h1', { hasText: name })).toBeVisible()

    // Toggle is enabled (PUBLIC, not yet default)
    const toggle = page.getByRole('button', { name: /Set as gym default/ })
    await expect(toggle).toBeEnabled()
    await toggle.click()

    // After the click the toggle flips to "⭐ Gym default" and the badge renders
    await expect(page.getByRole('button', { name: /Gym default/ })).toBeDisabled({ timeout: 5000 })
    await expect(page.getByLabel('Gym default program')).toBeVisible()

    // DB confirms isDefault
    const row = await prisma.gymProgram.findUnique({
      where: { gymId_programId: { gymId: f.gymId, programId: seeded.id } },
    })
    expect(row?.isDefault).toBe(true)
  })

  test('MEMBER sees the default program in the sidebar picker without subscribing', async ({ page }) => {
    const name = `E2E Default For Members ${randomUUID().slice(0, 6)}`
    const seeded = await prisma.program.create({
      data: {
        name,
        startDate: new Date('2026-07-01'),
        visibility: 'PUBLIC',
        gyms: { create: { gymId: f.gymId, isDefault: true } },
      },
    })

    await loginAndSelectGym(page, f.member.id, 'MEMBER', f.gymId)
    await page.goto('/feed')

    // Sidebar picker dropdown — open it and look for the default program entry
    const picker = page.locator('aside').first().getByRole('button').filter({ hasText: /All programs|Programs/ }).first()
    await picker.click()
    await expect(page.getByRole('listbox').getByText(name)).toBeVisible({ timeout: 5000 })

    // Confirm no UserProgram row was created — the default surfaces virtually
    const sub = await prisma.userProgram.findUnique({
      where: { userId_programId: { userId: f.member.id, programId: seeded.id } },
    })
    expect(sub).toBeNull()
  })
})
