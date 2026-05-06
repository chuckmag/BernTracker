/**
 * Playwright E2E for the staff→user gym invitation flow (slice D1 of #120).
 *
 * Verifies the full cross-stack lifecycle:
 *  - OWNER fills the invite form on /gym-settings → invitation persists.
 *  - The invitee logs in → InvitationsBanner is visible across pages.
 *  - The invitee accepts from /profile → UserGym row exists with the granted role.
 *
 * Uses JWT cookie injection via tests/lib/auth.ts.
 *
 * Run via the worktree:
 *   npm run test:worktree -- e2e tests/gym-invitations.spec.ts
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'
import { loginAs, prisma } from './lib/auth.js'

interface Fixture {
  gymId: string
  ownerId: string
  inviteeId: string
  inviteeEmail: string
}

async function seed(): Promise<Fixture> {
  const ts = randomUUID().slice(0, 8)
  const gym = await prisma.gym.create({
    data: { name: `Inv E2E Gym ${ts}`, slug: `inv-e2e-${ts}`, timezone: 'UTC' },
  })
  const inviteeEmail = `inv-e2e-invitee-${ts}@test.com`
  const owner = await prisma.user.create({ data: { email: `inv-e2e-owner-${ts}@test.com` } })
  const invitee = await prisma.user.create({ data: { email: inviteeEmail } })
  await prisma.userGym.create({ data: { userId: owner.id, gymId: gym.id, role: 'OWNER' } })
  return {
    gymId: gym.id,
    ownerId: owner.id,
    inviteeId: invitee.id,
    inviteeEmail,
  }
}

async function teardown(f: Fixture) {
  await prisma.gymMembershipRequest.deleteMany({ where: { gymId: f.gymId } })
  await prisma.userGym.deleteMany({ where: { gymId: f.gymId } })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [f.ownerId, f.inviteeId] } } })
  await prisma.user.deleteMany({ where: { id: { in: [f.ownerId, f.inviteeId] } } })
  await prisma.gym.delete({ where: { id: f.gymId } }).catch(() => {})
}

test.describe('Gym invitation E2E', () => {
  let f: Fixture
  test.beforeEach(async () => { f = await seed() })
  test.afterEach(async () => { await teardown(f) })

  test('OWNER invites by email → invitee accepts → UserGym created', async ({ browser }) => {
    // ── OWNER side ────────────────────────────────────────────────────────────
    const ownerCtx = await browser.newContext()
    await loginAs(ownerCtx, f.ownerId, 'OWNER')
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.addInitScript((id) => localStorage.setItem('gymId', id), f.gymId)
    // /gym-settings is now tabbed (Details default, Members second). Invite
    // form lives inside the Members tab via GymInvitationsPanel.
    await ownerPage.goto('/gym-settings#members')

    await expect(ownerPage.getByRole('heading', { name: 'Gym Settings' })).toBeVisible()
    await expect(ownerPage.getByRole('heading', { name: 'Invitations', exact: true })).toBeVisible()

    // Channel defaults to EMAIL. Fill the email address field and send.
    await ownerPage.getByLabel('Email address').fill(f.inviteeEmail)
    // Role select defaults to MEMBER, leave as-is.
    await ownerPage.getByRole('button', { name: /^Invite$/ }).click()

    // The new invitation row should appear in the pending list.
    await expect(ownerPage.getByText(f.inviteeEmail)).toBeVisible({ timeout: 5_000 })
    await ownerCtx.close()

    // DB invariant: pending invitation persisted.
    const pending = await prisma.gymMembershipRequest.findFirst({
      where: { gymId: f.gymId, email: f.inviteeEmail, status: 'PENDING' },
    })
    expect(pending).not.toBeNull()

    // ── Invitee side ─────────────────────────────────────────────────────────
    const inviteeCtx = await browser.newContext()
    await loginAs(inviteeCtx, f.inviteeId, 'MEMBER')
    const inviteePage = await inviteeCtx.newPage()
    await inviteePage.goto('/feed')

    // Banner visible across the app shell.
    await expect(inviteePage.getByText(/You have 1 pending invitation/)).toBeVisible({ timeout: 5_000 })

    // Click View → /profile, banner anchor jumps to invitations section.
    await inviteePage.getByRole('link', { name: /View/ }).click()
    await expect(inviteePage).toHaveURL(/\/profile#invitations$/)
    await expect(inviteePage.getByRole('heading', { name: 'Invitations', exact: true })).toBeVisible()

    await inviteePage.getByRole('button', { name: 'Accept' }).click()

    // After accept, invitation drops off the list (refetch returns nothing).
    await expect(inviteePage.getByText(/You have 1 pending invitation/)).not.toBeVisible({ timeout: 5_000 })
    await inviteeCtx.close()

    // DB invariants: UserGym created with role=MEMBER, invitation APPROVED.
    const membership = await prisma.userGym.findUnique({
      where: { userId_gymId: { userId: f.inviteeId, gymId: f.gymId } },
    })
    expect(membership?.role).toBe('MEMBER')
    const finalInvite = await prisma.gymMembershipRequest.findFirst({
      where: { gymId: f.gymId, email: f.inviteeEmail },
    })
    expect(finalInvite?.status).toBe('APPROVED')
    expect(finalInvite?.userId).toBe(f.inviteeId)
  })

  test('invitee declines → no UserGym row, status DECLINED', async ({ browser }) => {
    // Pre-seed a pending invite directly (skips the UI invite form to keep the
    // happy-path test the canonical one).
    const invite = await prisma.gymMembershipRequest.create({
      data: {
        gymId: f.gymId,
        direction: 'STAFF_INVITED',
        email: f.inviteeEmail.toLowerCase(),
        userId: f.inviteeId,
        roleToGrant: 'COACH',
        invitedById: f.ownerId,
      },
    })

    const ctx = await browser.newContext()
    await loginAs(ctx, f.inviteeId, 'MEMBER')
    const page = await ctx.newPage()
    // /profile is now tabbed (Details default, Memberships second). The
    // invitations list lives on the Memberships tab; jump there via hash.
    await page.goto('/profile#memberships')

    await expect(page.getByRole('heading', { name: 'Invitations', exact: true })).toBeVisible()
    const declineResponse = page.waitForResponse((res) =>
      res.url().includes('/decline') && res.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Decline' }).click()
    const apiRes = await declineResponse
    expect(apiRes.status()).toBe(200)
    await ctx.close()

    const after = await prisma.gymMembershipRequest.findUnique({ where: { id: invite.id } })
    expect(after?.status).toBe('DECLINED')
    const membership = await prisma.userGym.findUnique({
      where: { userId_gymId: { userId: f.inviteeId, gymId: f.gymId } },
    })
    expect(membership).toBeNull()
  })
})
