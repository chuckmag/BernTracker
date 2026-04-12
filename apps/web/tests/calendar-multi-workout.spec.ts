/**
 * Playwright E2E UAT for PR #47 — Multi-Workout Calendar
 *
 * Covers all unchecked test plan items from the PR:
 *   T1: "+N more" overflow appears with 4 workouts on one day
 *   T2: "+" button on a cell opens the drawer in create mode
 *   T3: "Add another workout" switches the drawer to create mode and clears the form
 *   T4: Saving a new workout closes the drawer and adds a pill to the cell
 *   T5: Deleting a workout removes its pill from the cell
 *   T6: ↑/↓ buttons are visible for PROGRAMMER with correct disabled states
 *   T7: Clicking ↑ reorders workouts without closing the drawer
 *   T8: COACH role does not see ↑/↓ reorder buttons
 *
 * Requires: turbo dev running (API on :3000, web on :5173)
 * Run: npm run test --workspace=@berntracker/web
 *   or: cd apps/web && npx dotenv-cli -e ../../.env -- npx playwright test
 */

import { test, expect, type Page } from '@playwright/test'
import { createRequire } from 'module'
import bcrypt from 'bcryptjs'

// @prisma/client is CJS and uses `module.exports = { ...require(...) }` — Node.js
// cannot statically enumerate its named exports for ESM named imports.
// createRequire grabs the full exports object at runtime, bypassing the issue.
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient, ProgramRole } = _require('@prisma/client') as any
const prisma = new PrismaClient()

// ─── Shared state (set in beforeAll) ─────────────────────────────────────────

const TS = Date.now()
const TRAINER_EMAIL = `uat-trainer-${TS}@test.com`
const TRAINER_PASSWORD = 'TestPass1!'
const COACH_EMAIL = `uat-coach-${TS}@test.com`
const COACH_PASSWORD = 'TestPass1!'

// Fixed future month with no real data
const TEST_MONTH_LABEL = 'June 2026'

let gymId = ''
let programId = ''
let trainerUserId = ''
let coachUserId = ''

// One isolated day per test — avoids cross-test interference
const T1_DAY = 5   // "+N more" overflow
const T2_DAY = 6   // "+" button create mode
const T3_DAY = 7   // "Add another workout"
const T4_DAY = 8   // save creates pill
const T5_DAY = 9   // delete removes pill
const T6_DAY = 10  // reorder button visibility / disabled states
const T7_DAY = 11  // reorder action without closing drawer
const T8_DAY = 12  // COACH no reorder buttons

// ─── DB helpers ───────────────────────────────────────────────────────────────

function scheduledAt(day: number) {
  return new Date(`2026-06-${String(day).padStart(2, '0')}T12:00:00.000Z`)
}

async function seedWorkout(
  title: string,
  day: number,
  type = 'AMRAP',
  extra: { dayOrder?: number; status?: 'DRAFT' | 'PUBLISHED' } = {},
) {
  return prisma.workout.create({
    data: {
      title,
      description: 'UAT test workout',
      type: type as never,
      scheduledAt: scheduledAt(day),
      programId,
      status: extra.status ?? 'DRAFT',
      dayOrder: extra.dayOrder,
    },
  })
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function loginAndGoToCalendar(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')

  // Calendar reads gymId from localStorage on mount — must be set before navigation
  await page.evaluate((id) => localStorage.setItem('gymId', id), gymId)
  await page.goto('/calendar')
  await page.waitForSelector('h1:has-text("Calendar")')

  await navigateToMonth(page, TEST_MONTH_LABEL)
}

async function navigateToMonth(page: Page, targetLabel: string) {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  for (let i = 0; i < 24; i++) {
    const raw = await page.locator('span.w-44').textContent()
    const label = raw?.trim() ?? ''
    if (label === targetLabel) return
    const [cm, cy] = [MONTHS.indexOf(label.split(' ')[0] ?? ''), parseInt(label.split(' ')[1] ?? '0')]
    const [tm, ty] = [MONTHS.indexOf(targetLabel.split(' ')[0]), parseInt(targetLabel.split(' ')[1])]
    const goForward = cy < ty || (cy === ty && cm < tm)
    await page.click(goForward ? 'button[aria-label="Next month"]' : 'button[aria-label="Previous month"]')
    await page.waitForTimeout(150)
  }
}

/** Returns the CalendarCell div for the given day-of-month number. */
function cellForDay(page: Page, day: number) {
  // Empty cells are bare divs with no children; day cells have a date span.
  // The regex ^{day}$ prevents day 5 from matching day 15 or 25.
  return page.locator('div.bg-gray-950.h-24').filter({
    has: page.locator('span', { hasText: new RegExp(`^${day}$`) }),
  })
}

/** Returns the "Today's Workouts" panel inside the open drawer. */
function todaysWorkoutsPanel(page: Page) {
  return page.getByText("Today's Workouts", { exact: true }).locator('..')
}

// ─── Suite ────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Multi-workout calendar UAT (#47)', () => {
  test.beforeAll(async () => {
    const [trainerHash, coachHash] = await Promise.all([
      bcrypt.hash(TRAINER_PASSWORD, 10),
      bcrypt.hash(COACH_PASSWORD, 10),
    ])

    const gym = await prisma.gym.create({
      data: { name: `UAT Gym ${TS}`, slug: `uat-gym-${TS}`, timezone: 'UTC' },
    })
    gymId = gym.id

    const [trainer, coach] = await Promise.all([
      prisma.user.create({ data: { email: TRAINER_EMAIL, passwordHash: trainerHash } }),
      prisma.user.create({ data: { email: COACH_EMAIL, passwordHash: coachHash } }),
    ])
    trainerUserId = trainer.id
    coachUserId = coach.id

    await prisma.userGym.createMany({
      data: [
        { userId: trainerUserId, gymId, role: 'PROGRAMMER' },
        { userId: coachUserId, gymId, role: 'COACH' },
      ],
    })

    const program = await prisma.program.create({
      data: {
        name: `UAT Program ${TS}`,
        startDate: new Date('2026-01-01'),
        gyms: { create: { gymId } },
        members: {
          createMany: {
            data: [
              { userId: trainerUserId, role: ProgramRole.PROGRAMMER },
              { userId: coachUserId, role: ProgramRole.MEMBER },
            ],
          },
        },
      },
    })
    programId = program.id
  })

  test.afterAll(async () => {
    // Workouts have onDelete:SetNull for program — delete them first
    await prisma.workout.deleteMany({ where: { programId } })
    // Program deletion cascades GymProgram + UserProgram
    await prisma.program.delete({ where: { id: programId } }).catch(() => {})
    // User deletion cascades UserGym + RefreshToken
    await prisma.user.deleteMany({ where: { id: { in: [trainerUserId, coachUserId] } } })
    await prisma.gym.delete({ where: { id: gymId } }).catch(() => {})
    await prisma.$disconnect()
  })

  // ── T1: "+N more" overflow ───────────────────────────────────────────────

  test('T1: 4 workouts on one day show "+1 more" overflow text', async ({ page }) => {
    const workouts = await Promise.all([
      seedWorkout('T1 Alpha',   T1_DAY, 'WARMUP',   { dayOrder: 0 }),
      seedWorkout('T1 Beta',    T1_DAY, 'STRENGTH', { dayOrder: 1 }),
      seedWorkout('T1 Gamma',   T1_DAY, 'AMRAP',    { dayOrder: 2 }),
      seedWorkout('T1 Delta',   T1_DAY, 'FOR_TIME', { dayOrder: 3 }),
    ])

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    await expect(cellForDay(page, T1_DAY).getByText('+2 more')).toBeVisible()

    await prisma.workout.deleteMany({ where: { id: { in: workouts.map((w) => w.id) } } })
  })

  // ── T2: "+" button opens create mode ────────────────────────────────────

  test('T2: "+" button on a cell opens the drawer in create mode', async ({ page }) => {
    const w = await seedWorkout('T2 Existing', T2_DAY)

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    await cellForDay(page, T2_DAY).locator('button[aria-label="Add workout"]').click()

    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()

    await prisma.workout.delete({ where: { id: w.id } })
  })

  // ── T3: "Add another workout" switches to create mode ───────────────────

  test('T3: "Add another workout" clears form and switches to create mode', async ({ page }) => {
    // The Today's Workouts panel (which contains "Add another workout") only renders
    // in edit mode when workoutsOnDay.length > 1 — need 2 workouts to trigger the panel.
    const [w1, w2] = await Promise.all([
      seedWorkout('T3 Base', T3_DAY, 'WARMUP', { dayOrder: 0 }),
      seedWorkout('T3 Edit Me', T3_DAY, 'AMRAP', { dayOrder: 1 }),
    ])

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    // Open T3 Edit Me in edit mode — Today's Workouts panel is now visible (2 workouts)
    await cellForDay(page, T3_DAY).getByText('T3 Edit Me').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()

    // Click "Add another workout" in the Today's Workouts panel
    await page.getByRole('button', { name: 'Add another workout' }).click()

    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()
    await expect(page.locator('input[placeholder="e.g. Fran"]')).toHaveValue('')

    await prisma.workout.deleteMany({ where: { id: { in: [w1.id, w2.id] } } })
  })

  // ── T4: Save closes drawer and adds pill to cell ─────────────────────────

  test('T4: saving a new workout closes the drawer and shows a pill in the cell', async ({ page }) => {
    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    // Click "+" on an empty day to open create mode
    await cellForDay(page, T4_DAY).locator('button[aria-label="Add workout"]').click()
    await expect(page.locator('h2', { hasText: 'New Workout' })).toBeVisible()

    // Wait for the program dropdown to finish loading (disabled while fetching)
    await expect(page.locator('select[disabled]')).not.toBeAttached({ timeout: 5000 })

    await page.fill('input[placeholder="e.g. Fran"]', 'T4 New Workout')
    await page.fill('textarea[placeholder*="Workout details"]', 'E2E create test')
    await page.getByRole('button', { name: 'Save as Draft' }).click()

    // Drawer closes — the overlay is conditionally rendered with {isOpen && ...} so it
    // leaves the DOM entirely when the drawer closes (unlike the drawer panel which uses
    // translate-x-full and is never removed from the DOM)
    await expect(page.locator('div.fixed.inset-0.bg-black\\/40.z-30')).not.toBeAttached({ timeout: 5000 })

    // Pill appears in the cell
    await expect(cellForDay(page, T4_DAY).getByText('T4 New Workout')).toBeVisible()

    // Cleanup: workout was created by UI so we don't have its id — delete by title
    await prisma.workout.deleteMany({ where: { title: 'T4 New Workout', programId } })
  })

  // ── T5: Delete removes pill from cell ────────────────────────────────────

  test('T5: deleting a workout removes its pill from the cell', async ({ page }) => {
    await seedWorkout('T5 Delete Me', T5_DAY)

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    // Open in edit mode via cell pill
    await cellForDay(page, T5_DAY).getByText('T5 Delete Me').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()

    // Show delete confirm, then confirm
    await page.getByRole('button', { name: 'Delete workout' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    // Drawer closes — check overlay leaves DOM (translate-x-full doesn't satisfy not.toBeVisible)
    await expect(page.locator('div.fixed.inset-0.bg-black\\/40.z-30')).not.toBeAttached({ timeout: 5000 })

    // Pill is gone
    await expect(cellForDay(page, T5_DAY).getByText('T5 Delete Me')).not.toBeVisible()
  })

  // ── T6: Reorder buttons visible for PROGRAMMER, disabled states correct ──

  test('T6: ↑/↓ buttons are visible for PROGRAMMER with correct disabled states', async ({ page }) => {
    const [w1, w2] = await Promise.all([
      seedWorkout('T6 First',  T6_DAY, 'WARMUP', { dayOrder: 0 }),
      seedWorkout('T6 Second', T6_DAY, 'AMRAP',  { dayOrder: 1 }),
    ])

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    const cell = cellForDay(page, T6_DAY)

    // Open first workout — ↑ disabled (first position), ↓ enabled
    await cell.getByText('T6 First').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()
    await expect(page.locator('button[title="Move up"]')).toBeDisabled()
    await expect(page.locator('button[title="Move down"]')).toBeEnabled()

    // Switch to second workout via Today's Workouts panel — ↑ enabled, ↓ disabled (last)
    await todaysWorkoutsPanel(page).getByRole('button', { name: /T6 Second/ }).click()
    await expect(page.locator('button[title="Move up"]')).toBeEnabled()
    await expect(page.locator('button[title="Move down"]')).toBeDisabled()

    await prisma.workout.deleteMany({ where: { id: { in: [w1.id, w2.id] } } })
  })

  // ── T7: Reorder action without closing drawer ─────────────────────────────

  test('T7: clicking ↑ reorders workouts and keeps the drawer open', async ({ page }) => {
    const [w1, w2] = await Promise.all([
      seedWorkout('T7 Alpha', T7_DAY, 'WARMUP', { dayOrder: 0 }),
      seedWorkout('T7 Beta',  T7_DAY, 'AMRAP',  { dayOrder: 1 }),
    ])

    await loginAndGoToCalendar(page, TRAINER_EMAIL, TRAINER_PASSWORD)

    // Open T7 Beta (second pill — dayOrder 1, shown second in cell)
    await cellForDay(page, T7_DAY).getByText('T7 Beta').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()

    // Move T7 Beta up — swaps dayOrder with T7 Alpha
    await page.locator('button[title="Move up"]').click()

    // Drawer stays open after reorder
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible({ timeout: 5000 })

    // T7 Beta is now first in the Today's Workouts panel
    // Panel children: [header, row0, row1, addButton] — row0 is index 1
    const firstRow = todaysWorkoutsPanel(page).locator(':scope > *').nth(1)
    await expect(firstRow).toContainText('T7 Beta')

    await prisma.workout.deleteMany({ where: { id: { in: [w1.id, w2.id] } } })
  })

  // ── T8: COACH cannot see reorder buttons ─────────────────────────────────

  test('T8: COACH role does not see ↑/↓ reorder buttons', async ({ page }) => {
    const [w1, w2] = await Promise.all([
      seedWorkout('T8 One', T8_DAY, 'WARMUP', { dayOrder: 0, status: 'PUBLISHED' }),
      seedWorkout('T8 Two', T8_DAY, 'AMRAP',  { dayOrder: 1, status: 'PUBLISHED' }),
    ])

    await loginAndGoToCalendar(page, COACH_EMAIL, COACH_PASSWORD)

    await cellForDay(page, T8_DAY).getByText('T8 One').click()
    await expect(page.locator('h2', { hasText: 'Edit Workout' })).toBeVisible()

    // Reorder buttons must not be present in the DOM at all
    await expect(page.locator('button[title="Move up"]')).toHaveCount(0)
    await expect(page.locator('button[title="Move down"]')).toHaveCount(0)

    await prisma.workout.deleteMany({ where: { id: { in: [w1.id, w2.id] } } })
  })
})
