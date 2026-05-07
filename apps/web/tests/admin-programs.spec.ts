/**
 * Playwright E2E for the WODalytics admin program list + detail (#160 slice 2).
 *
 * Auth uses JWT cookie injection. The admin user is the first email in
 * WODALYTICS_ADMIN_EMAILS — the API's `requireWodalyticsAdmin` middleware
 * checks against the same env var, so seeding any user with a matching email
 * passes the gate.
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/admin-programs.spec.ts
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface AdminFixture {
  adminUserId: string
  programId: string
  workoutId: string
}

function pickAdminEmail(): string {
  const raw = process.env.WODALYTICS_ADMIN_EMAILS
  if (!raw) throw new Error('WODALYTICS_ADMIN_EMAILS must be set in .env')
  const parsed = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (parsed.length === 0) throw new Error('WODALYTICS_ADMIN_EMAILS parsed to empty list')
  return parsed[0]
}

async function seedAdminFixture(nameSuffix: string): Promise<AdminFixture> {
  const adminEmail = pickAdminEmail()
  // Upsert + never delete — the admin user is the same email across all
  // parallel specs, so racing creates would collide on the unique-email
  // constraint. Tolerating a long-lived admin row in the dev DB is fine.
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail },
  })
  const adminUserId = admin.id

  const program = await prisma.program.create({
    data: {
      name: `Admin E2E ${nameSuffix}`,
      visibility: 'PUBLIC',
      startDate: new Date('2026-04-01'),
    },
  })
  const workout = await prisma.workout.create({
    data: {
      programId: program.id,
      title: `Admin E2E Workout ${nameSuffix}`,
      description: 'For Time: 21-15-9',
      type: 'FOR_TIME',
      status: 'PUBLISHED',
      scheduledAt: new Date('2026-04-15T10:00:00Z'),
    },
  })

  return { adminUserId, programId: program.id, workoutId: workout.id }
}

async function teardown(fx: AdminFixture, extraUserId?: string) {
  await prisma.workout.delete({ where: { id: fx.workoutId } }).catch(() => {})
  await prisma.program.delete({ where: { id: fx.programId } }).catch(() => {})
  if (extraUserId) await prisma.user.delete({ where: { id: extraUserId } }).catch(() => {})
  // Don't delete the admin user — it's the shared WODALYTICS_ADMIN_EMAILS
  // user, reused across parallel specs and persistent in the dev DB.
}

test('admin sees the WODalytics Settings sidebar entry and can list + view an unaffiliated program', async ({ page, context }) => {
  const nameSuffix = randomUUID().slice(0, 8)
  const fx = await seedAdminFixture(nameSuffix)
  try {
    await loginAs(context, fx.adminUserId, 'OWNER')
    await page.goto('/admin/settings')

    // Sidebar Settings link for admin. Use the link role specifically so
    // we don't conflict with the page h1 (also "Settings") or with
    // "Gym Settings" in the Staff section. Bump timeout a bit because
    // AuthContext + sidebar conditional render races under parallel load.
    await expect(page.getByRole('link', { name: 'WODalytics Settings', exact: true })).toBeVisible({ timeout: 10000 })

    // The seeded program shows up in the list. Match the unique nonce so
    // parallel-running specs that seeded sibling "Admin E2E ..." programs
    // can't trick `.first()` into clicking the wrong row.
    const listLink = page.getByRole('link', { name: new RegExp(`Admin E2E ${nameSuffix}`) })
    await expect(listLink).toBeVisible()

    // Click into detail; verify program name + workouts section + the seeded workout.
    await listLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`Admin E2E ${nameSuffix}`)
    await expect(page.getByRole('heading', { name: 'Workouts' })).toBeVisible()
    await expect(page.getByText(`Admin E2E Workout ${nameSuffix}`)).toBeVisible()
  } finally {
    await teardown(fx)
  }
})

test('admin can create a workout under an unaffiliated program (slice 3)', async ({ page, context }) => {
  const fx = await seedAdminFixture(randomUUID().slice(0, 8))
  let createdWorkoutId: string | null = null
  const newTitle = `Admin E2E New Workout ${randomUUID().slice(0, 8)}`
  try {
    await loginAs(context, fx.adminUserId, 'OWNER')
    await page.goto(`/admin/programs/${fx.programId}`)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Admin E2E')
    await page.getByRole('button', { name: '+ New Workout' }).click()

    // The shared WorkoutDrawer opens. Title input renders immediately;
    // programs load asynchronously into the picker — wait for the select
    // to settle on the seeded program before filling the form so the
    // create call carries the right programId.
    const title = page.getByPlaceholder('e.g. Fran')
    await expect(title).toBeVisible({ timeout: 10000 })
    await expect(page.locator('select#wd-program')).toHaveValue(/.+/, { timeout: 10000 })

    await title.fill(newTitle)
    await page.getByPlaceholder(/Workout details/).fill('21-15-9 thrusters / pull-ups')

    // Admin uses the same Save-as-Draft / Publish split as the gym
    // calendar — the shared WorkoutDrawer footer renders both buttons.
    // Click Publish, then confirm in the dialog. End state in the DB:
    // status=PUBLISHED via the new POST /api/admin/workouts/:id/publish.
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm Publish' }).click()

    // The drawer closes and the new workout appears in the list.
    await expect(page.getByText(newTitle)).toBeVisible({ timeout: 10000 })

    const created = await prisma.workout.findFirst({ where: { title: newTitle } })
    if (!created) throw new Error('Created workout not found in DB')
    createdWorkoutId = created.id
    expect(created.programId).toBe(fx.programId)
    expect(created.status).toBe('PUBLISHED')
  } finally {
    if (createdWorkoutId) await prisma.workout.delete({ where: { id: createdWorkoutId } }).catch(() => {})
    await teardown(fx)
  }
})

test('non-admin user does not see the WODalytics Settings sidebar entry', async ({ page, context }) => {
  const fx = await seedAdminFixture(randomUUID().slice(0, 8))
  const ts = randomUUID().slice(0, 8)
  const nonAdmin = await prisma.user.create({ data: { email: `admin-e2e-nonadmin-${ts}@test.com` } })
  try {
    await loginAs(context, nonAdmin.id, 'MEMBER')
    await page.goto('/feed')

    // Sidebar Settings link is admin-only. (Gym Settings still appears
    // for staff but its name is "Gym Settings", not "Settings".)
    await expect(page.getByRole('link', { name: 'WODalytics Settings', exact: true })).toHaveCount(0)

    // Direct navigation to /admin/settings is allowed (route isn't gated
    // by role on the client; the API enforces the 403). The point of this
    // leg is just that the non-admin sees no admin program content,
    // regardless of which page state the app lands on under load. Wait
    // for the URL to settle, then assert: no admin program rows appear
    // and no admin sidebar entry appeared.
    await page.goto('/admin/settings')
    await page.waitForURL('**/admin/settings', { timeout: 10000 })
    await expect(page.getByText(/Admin E2E /)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'WODalytics Settings', exact: true })).toHaveCount(0)
  } finally {
    await teardown(fx, nonAdmin.id)
  }
})
