/**
 * Playwright E2E for the user→gym join-request flow (slice D2 of #120).
 *
 * Two browser contexts: outsider (the user requesting to join) and gym owner
 * (the staff approving). Verifies the full cross-stack lifecycle:
 *  - Outsider opens /gyms/browse, finds the gym, clicks Request to join.
 *  - Owner opens /gym-settings#members, sees the request, clicks Approve.
 *  - DB invariants: UserGym row created with role=MEMBER, request APPROVED.
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/gym-join-request.spec.ts
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface Fixture {
  gymId: string
  gymName: string
  ownerId: string
  outsiderId: string
}

async function seed(): Promise<Fixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `JR E2E Gym ${ts}`, slug: `jr-e2e-${ts}`, timezone: 'UTC' },
  })
  const owner = await prisma.user.create({ data: { email: `jr-e2e-owner-${ts}@test.com` } })
  const outsider = await prisma.user.create({ data: { email: `jr-e2e-outsider-${ts}@test.com` } })
  await prisma.userGym.create({ data: { userId: owner.id, gymId: gym.id, role: 'OWNER' } })
  return { gymId: gym.id, gymName: gym.name, ownerId: owner.id, outsiderId: outsider.id }
}

async function teardown(f: Fixture) {
  await prisma.gymMembershipRequest.deleteMany({ where: { gymId: f.gymId } })
  await prisma.userGym.deleteMany({ where: { gymId: f.gymId } })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [f.ownerId, f.outsiderId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [f.ownerId, f.outsiderId] } } })
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

test.describe('Gym join request E2E', () => {
  let f: Fixture
  test.beforeEach(async () => { f = await seed() })
  test.afterEach(async () => { await teardown(f) })

  test('outsider requests to join → owner approves → UserGym created', async ({ browser }) => {
    // ── Outsider side ────────────────────────────────────────────────────────
    const outsiderCtx = await browser.newContext()
    await loginAs(outsiderCtx, f.outsiderId, 'MEMBER')
    const outsiderPage = await outsiderCtx.newPage()
    await outsiderPage.goto('/gyms/browse')

    await expect(outsiderPage.getByRole('heading', { name: 'Browse gyms' })).toBeVisible()
    // Use the search filter to narrow + scope the click to our specific row
    // so concurrent test runs in the shared dev DB don't collide.
    await outsiderPage.getByLabel('Search').fill(f.gymName)
    const ourRow = outsiderPage.getByRole('listitem').filter({ hasText: f.gymName })
    await expect(ourRow).toBeVisible({ timeout: 5_000 })

    await ourRow.getByRole('button', { name: 'Request to join' }).click()
    await expect(ourRow.getByText('Request pending')).toBeVisible({ timeout: 5_000 })
    await outsiderCtx.close()

    // DB invariant: pending USER_REQUESTED row exists.
    const pending = await prisma.gymMembershipRequest.findFirst({
      where: { gymId: f.gymId, userId: f.outsiderId, direction: 'USER_REQUESTED', status: 'PENDING' },
    })
    expect(pending).not.toBeNull()

    // ── Owner side ───────────────────────────────────────────────────────────
    const ownerCtx = await browser.newContext()
    await loginAs(ownerCtx, f.ownerId, 'OWNER')
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.addInitScript((id) => localStorage.setItem('gymId', id), f.gymId)
    await ownerPage.goto('/gym-settings#members')

    await expect(ownerPage.getByRole('heading', { name: 'Join requests', exact: true })).toBeVisible()
    // The Approve button is the most reliable signal that the request rendered.
    // (The user's email appears twice in the row — display name + subtitle —
    // so we anchor on something unambiguous.)
    await expect(ownerPage.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 5_000 })

    // Wait for the actual API response, not just the button disappearing —
    // closing the context before the fetch finishes would otherwise abort the
    // approve transaction mid-flight.
    const approveResponse = ownerPage.waitForResponse((res) =>
      res.url().includes('/approve') && res.request().method() === 'POST'
    )
    await ownerPage.getByRole('button', { name: 'Approve' }).click()
    const apiRes = await approveResponse
    expect(apiRes.status()).toBe(200)
    await ownerCtx.close()

    // DB invariants: UserGym row created with role=MEMBER, status=APPROVED.
    const membership = await prisma.userGym.findUnique({
      where: { userId_gymId: { userId: f.outsiderId, gymId: f.gymId } },
    })
    expect(membership?.role).toBe('MEMBER')
    const finalRequest = await prisma.gymMembershipRequest.findFirst({
      where: { gymId: f.gymId, userId: f.outsiderId, direction: 'USER_REQUESTED' },
    })
    expect(finalRequest?.status).toBe('APPROVED')
  })

  test('outsider cancels their own pending request from /profile', async ({ browser }) => {
    // Pre-seed a pending request — exercises the user-side Cancel path
    // without going through Browse Gyms again.
    const created = await prisma.gymMembershipRequest.create({
      data: {
        gymId: f.gymId,
        direction: 'USER_REQUESTED',
        userId: f.outsiderId,
        roleToGrant: 'MEMBER',
      },
    })

    const ctx = await browser.newContext()
    await loginAs(ctx, f.outsiderId, 'MEMBER')
    const page = await ctx.newPage()
    // Memberships tab — outgoing requests live there now (slice D2 review).
    // Use the hash anchor to land on the right tab without an extra click.
    await page.goto('/profile#memberships')

    await expect(page.getByRole('heading', { name: 'Outgoing requests' })).toBeVisible()
    await expect(page.getByText(f.gymName)).toBeVisible()

    const cancelResponse = page.waitForResponse((res) =>
      res.url().includes('/join-request') && res.request().method() === 'DELETE'
    )
    await page.getByRole('button', { name: /Cancel request/ }).click()
    const apiRes = await cancelResponse
    expect(apiRes.status()).toBe(200)
    await ctx.close()

    const after = await prisma.gymMembershipRequest.findUnique({ where: { id: created.id } })
    expect(after?.status).toBe('REVOKED')
    const noMembership = await prisma.userGym.findUnique({
      where: { userId_gymId: { userId: f.outsiderId, gymId: f.gymId } },
    })
    expect(noMembership).toBeNull()
  })
})
