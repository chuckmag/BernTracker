/**
 * Playwright E2E for coach notes on a workout (#184 / web slice #186).
 *
 * Verifies the role-driven default-open behavior of the WodDetail
 * coach-notes <details> section:
 *
 *   T1 — PROGRAMMER opens a workout with coach notes → section is expanded.
 *   T2 — MEMBER opens the same workout → section is collapsed; clicking the
 *        summary expands it.
 *
 * Auth via JWT cookie injection (tests/lib/auth.ts). Each test seeds its own
 * gym, users, program, and workout, and tears them down in afterEach. No
 * describe.serial — playwright.config.ts runs fully parallel.
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/coach-notes.spec.ts
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma, type Role } from './lib/auth.js'

interface CoachNotesFixture {
  gymId: string
  programId: string
  workoutId: string
  programmerUserId: string
  memberUserId: string
}

const NOTES_BODY = 'Stim: 7-min sprint pace. Sub ring rows if pull-ups break form.'

async function seedFixture(): Promise<CoachNotesFixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `Coach Notes E2E ${ts}`, slug: `coach-notes-e2e-${ts}`, timezone: 'UTC' },
  })
  const programmer = await prisma.user.create({
    data: { email: `coach-notes-prog-${ts}@test.com`, name: 'E2E Programmer' },
  })
  const member = await prisma.user.create({
    data: { email: `coach-notes-member-${ts}@test.com`, name: 'E2E Member' },
  })
  await prisma.userGym.createMany({
    data: [
      { userId: programmer.id, gymId: gym.id, role: 'PROGRAMMER' },
      { userId: member.id, gymId: gym.id, role: 'MEMBER' },
    ],
  })
  const program = await prisma.program.create({
    data: {
      name: `Coach Notes Program ${ts}`,
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
  const workout = await prisma.workout.create({
    data: {
      title: `Coach Notes Workout ${ts}`,
      description: '21-15-9 thrusters / pull-ups',
      coachNotes: NOTES_BODY,
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-15T12:00:00.000Z'),
      programId: program.id,
      dayOrder: 0,
    },
  })
  return {
    gymId: gym.id,
    programId: program.id,
    workoutId: workout.id,
    programmerUserId: programmer.id,
    memberUserId: member.id,
  }
}

async function teardown(f: CoachNotesFixture) {
  await prisma.workout.delete({ where: { id: f.workoutId } }).catch(() => {})
  await prisma.program.delete({ where: { id: f.programId } }).catch(() => {})
  await prisma.user.deleteMany({
    where: { id: { in: [f.programmerUserId, f.memberUserId] } },
  }).catch(() => {})
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function login(page: Page, userId: string, role: Role, gymId: string) {
  await loginAs(page.context(), userId, role)
  await page.addInitScript((id) => localStorage.setItem('gymId', id), gymId)
}

test.describe('Coach notes — role-driven default-open on WodDetail', () => {
  let f: CoachNotesFixture
  test.beforeEach(async () => { f = await seedFixture() })
  test.afterEach(async () => { await teardown(f) })

  test('T1: PROGRAMMER sees the coach-notes section expanded by default', async ({ page }) => {
    await login(page, f.programmerUserId, 'PROGRAMMER', f.gymId)
    await page.goto(`/workouts/${f.workoutId}`)

    const details = page.getByTestId('coach-notes')
    await expect(details).toBeVisible({ timeout: 5000 })
    // Default open for staff roles.
    await expect(details).toHaveAttribute('open', '')
    // Body content visible without any interaction.
    await expect(page.getByText(NOTES_BODY)).toBeVisible()
  })

  test('T2: MEMBER sees the section collapsed by default; clicking expands it', async ({ page }) => {
    await login(page, f.memberUserId, 'MEMBER', f.gymId)
    await page.goto(`/workouts/${f.workoutId}`)

    const details = page.getByTestId('coach-notes')
    await expect(details).toBeVisible({ timeout: 5000 })
    // Collapsed by default for members.
    await expect(details).not.toHaveAttribute('open', '')
    // The summary handle is visible even when collapsed.
    const summary = details.getByText('Coach notes', { exact: true })
    await expect(summary).toBeVisible()
    // Clicking the summary expands the section and reveals the body.
    await summary.click()
    await expect(details).toHaveAttribute('open', '')
    await expect(page.getByText(NOTES_BODY)).toBeVisible()
  })
})
