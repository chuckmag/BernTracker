/**
 * E2E for the canonical member result-logging cross-stack flows.
 *
 * - AMRAP: open WOD detail → Log Result drawer → submit → leaderboard updates,
 *   "Your Result" displays.
 * - FOR_TIME capped: same flow, asserting the leaderboard renders CAPPED.
 * - History: a logged result shows up on /history with its workout title and
 *   navigates back to the WOD on click.
 *
 * Each test seeds its own gym/user/program/workout(s) and tears them down.
 * Independent, JWT cookie injection.
 */

import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface MemberFixture {
  gymId: string
  programId: string
  memberUserId: string
  amrapWorkoutId: string
  forTimeWorkoutId: string
}

async function seedMemberFixture(): Promise<MemberFixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `E2E Result Gym ${ts}`, slug: `e2e-result-${ts}`, timezone: 'UTC' },
  })
  const member = await prisma.user.create({
    data: { email: `uat-result-${ts}@test.com`, name: 'E2E Result Member' },
  })
  await prisma.userGym.create({ data: { userId: member.id, gymId: gym.id, role: 'MEMBER' } })
  const program = await prisma.program.create({
    data: {
      name: `E2E Result Program ${ts}`,
      startDate: new Date('2026-01-01'),
      gyms: { create: { gymId: gym.id } },
      members: { create: { userId: member.id, role: 'MEMBER' } },
    },
  })
  const day = new Date(); day.setUTCHours(12, 0, 0, 0)
  const dayPlus1 = new Date(day); dayPlus1.setUTCDate(day.getUTCDate() + 1)
  const amrap = await prisma.workout.create({
    data: {
      title: `E2E AMRAP ${ts}`,
      description: 'AMRAP 20: 5 Pull-ups, 10 Push-ups, 15 Squats',
      type: 'AMRAP', status: 'PUBLISHED', scheduledAt: day, programId: program.id, dayOrder: 0,
    },
  })
  const forTime = await prisma.workout.create({
    data: {
      title: `E2E For Time ${ts}`,
      description: '21-15-9: Thrusters + Pull-ups',
      type: 'FOR_TIME', status: 'PUBLISHED', scheduledAt: dayPlus1, programId: program.id, dayOrder: 0,
    },
  })
  return {
    gymId: gym.id, programId: program.id, memberUserId: member.id,
    amrapWorkoutId: amrap.id, forTimeWorkoutId: forTime.id,
  }
}

async function teardown(f: MemberFixture) {
  await prisma.result.deleteMany({ where: { workoutId: { in: [f.amrapWorkoutId, f.forTimeWorkoutId] } } }).catch(() => {})
  await prisma.workout.deleteMany({ where: { programId: f.programId } }).catch(() => {})
  await prisma.program.delete({ where: { id: f.programId } }).catch(() => {})
  await prisma.user.delete({ where: { id: f.memberUserId } }).catch(() => {})
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

async function loginMember(page: Page, f: MemberFixture) {
  await loginAs(page.context(), f.memberUserId, 'MEMBER')
  await page.addInitScript((id) => localStorage.setItem('gymId', id), f.gymId)
}

test.describe('Member result-logging E2E', () => {
  let f: MemberFixture
  test.beforeEach(async () => { f = await seedMemberFixture() })
  test.afterEach(async () => { await teardown(f) })

  test('AMRAP: log result via drawer → leaderboard + "Your Result" updated', async ({ page }) => {
    await loginMember(page, f)
    await page.goto(`/workouts/${f.amrapWorkoutId}`)
    await expect(page.getByRole('heading', { name: `E2E AMRAP ${f.amrapWorkoutId.slice(-8)}` })).toHaveCount(0)
    await page.waitForSelector('h1')

    await page.getByRole('button', { name: 'Log Result' }).click()
    await page.getByRole('button', { name: 'Scaled', exact: true }).click()
    const inputs = page.locator('input[placeholder="0"]')
    await inputs.nth(0).fill('7')
    await inputs.nth(1).fill('4')
    await page.getByRole('button', { name: 'Save Result' }).click()

    await expect(page.getByText('Your Result')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: 'Log Result' })).not.toBeVisible()
    await expect(page.getByRole('cell', { name: /7 rounds \+ 4 reps/ })).toBeVisible()
    await expect(page.getByText('(you)')).toBeVisible()
  })

  test('FOR_TIME: leaderboard shows the formatted time after submit', async ({ page }) => {
    await loginMember(page, f)
    await page.goto(`/workouts/${f.forTimeWorkoutId}`)
    await page.waitForSelector('h1')

    await page.getByRole('button', { name: 'Log Result' }).click()
    const inputs = page.locator('input[placeholder="0"]')
    // Min, Sec — submit a 4:30 time.
    await inputs.nth(0).fill('4')
    await inputs.nth(1).fill('30')
    await page.getByRole('button', { name: 'Save Result' }).click()

    await expect(page.getByText('Your Result')).toBeVisible({ timeout: 5000 })
    // Leaderboard cell renders the formatted time.
    await expect(page.getByRole('cell', { name: /4:30/ })).toBeVisible()
  })

  test('Feed tile: badge row appears with loaded barbell + count "1" after the viewer logs', async ({ page }) => {
    await loginMember(page, f)
    await page.goto('/feed')
    await page.waitForSelector('h1')

    const tile = page.getByRole('button', { name: /E2E AMRAP/i })
    await expect(tile).toBeVisible()

    // Before logging: 0 total results AND the viewer hasn't logged, so the
    // entire badge row is hidden by design — neither barbell variant renders.
    await expect(tile.getByRole('img', { name: /no result logged yet/i })).toHaveCount(0)
    await expect(tile.getByRole('img', { name: /you've logged a result/i })).toHaveCount(0)

    // Open the WOD and log a result via the drawer.
    await tile.click()
    await page.waitForURL(`**/workouts/${f.amrapWorkoutId}`)
    await page.getByRole('button', { name: 'Log Result' }).click()
    await page.getByRole('button', { name: 'Scaled', exact: true }).click()
    const inputs = page.locator('input[placeholder="0"]')
    await inputs.nth(0).fill('3')
    await inputs.nth(1).fill('1')
    await page.getByRole('button', { name: 'Save Result' }).click()
    await expect(page.getByText('Your Result')).toBeVisible({ timeout: 5000 })

    // Back on the feed: the same tile now shows the loaded barbell + count "1".
    await page.goto('/feed')
    const tileAfter = page.getByRole('button', { name: /E2E AMRAP/i })
    await expect(tileAfter.getByRole('img', { name: /you've logged a result/i })).toBeVisible()
    // exact:true avoids matching the workout title's nonce (e.g. "c11353b7"), which contains digits.
    await expect(tileAfter.getByText('1', { exact: true })).toBeVisible()
  })

  test('Feed tile: empty-barbell + count appear when others have results but the viewer has not logged', async ({ page }) => {
    // Seed a result from a different user so the workout has _count.results > 0
    // but the viewer's myResultId is null — the canonical "empty barbell" state.
    const ghost = await prisma.user.create({
      data: { email: `e2e-ghost-${randomUUID().slice(0, 8)}@test.com`, name: 'Ghost' },
    })
    await prisma.userGym.create({ data: { userId: ghost.id, gymId: f.gymId, role: 'MEMBER' } })
    await prisma.result.create({
      data: {
        workoutId: f.amrapWorkoutId, userId: ghost.id, level: 'RX',
        workoutGender: 'OPEN',
        value: { type: 'AMRAP', rounds: 4, extraReps: 0 },
      },
    })

    await loginMember(page, f)
    await page.goto('/feed')
    await page.waitForSelector('h1')

    const tile = page.getByRole('button', { name: /E2E AMRAP/i })
    await expect(tile.getByRole('img', { name: /no result logged yet/i })).toBeVisible()
    await expect(tile.getByRole('img', { name: /you've logged a result/i })).toHaveCount(0)
    await expect(tile.getByText('1', { exact: true })).toBeVisible()

    // Cleanup the seeded ghost user/result (workout cleanup is handled by teardown).
    await prisma.result.deleteMany({ where: { userId: ghost.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: ghost.id } }).catch(() => {})
  })

  test('Leaderboard: row click opens read-only result detail with the owner\'s name in the title', async ({ page }) => {
    // Seed a result so the leaderboard has an entry to click.
    await prisma.result.create({
      data: {
        workoutId: f.amrapWorkoutId, userId: f.memberUserId, level: 'RX',
        workoutGender: 'OPEN',
        value: { type: 'AMRAP', rounds: 5, reps: 10 },
        notes: 'Felt fast on round 4.',
      },
    })
    await loginMember(page, f)
    await page.goto(`/workouts/${f.amrapWorkoutId}`)
    await page.waitForSelector('h1')

    // Click the row whose athlete cell contains "(you)" — the seeded result is the
    // current user's, so the title becomes "Your Result" rather than the name.
    await page.getByRole('button', { name: /View your result/i }).click()
    await page.waitForURL(`**/workouts/${f.amrapWorkoutId}/results/**`)

    await expect(page.getByRole('heading', { name: 'Your Result' })).toBeVisible()
    await expect(page.getByText('Felt fast on round 4.')).toBeVisible()
    await expect(page.getByText(/5 rounds \+ 10 reps/)).toBeVisible()
  })

  test('History: a logged result appears on /history and links back to the WOD', async ({ page }) => {
    // Seed a result directly so this test isn't dependent on the AMRAP drawer flow.
    await prisma.result.create({
      data: {
        workoutId: f.amrapWorkoutId, userId: f.memberUserId, level: 'RX',
        workoutGender: 'OPEN',
        value: { type: 'AMRAP', rounds: 5, extraReps: 0 },
      },
    })
    await loginMember(page, f)
    await page.goto('/history')
    await page.waitForSelector('h1:has-text("History")')

    const titleRegex = new RegExp(`E2E AMRAP ${f.amrapWorkoutId.slice(-8)}|E2E AMRAP`)
    // History rows render the workout title — click navigates to the WOD detail.
    const row = page.locator('button', { hasText: 'E2E AMRAP' }).first()
    await expect(row).toBeVisible()
    await row.click()
    await page.waitForURL(`**/workouts/${f.amrapWorkoutId}`)
    await expect(page.locator('h1', { hasText: titleRegex })).toBeVisible()
  })
})
