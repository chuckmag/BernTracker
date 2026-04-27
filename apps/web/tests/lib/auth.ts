/**
 * E2E auth helpers — sign a refresh token in-process and inject it as a cookie
 * on a Playwright BrowserContext, mirroring the JWT trick the API integration
 * tests use (`signTokenPair` in `apps/api/src/lib/jwt.ts`).
 *
 * Why: driving the `/login` form in every test triggered a chromium-level
 * second-fetch flake (see issue #101). With cookie injection there's no real
 * login round-trip, so the flake is impossible by construction.
 *
 * Usage:
 *   const userId = await seedUser({ email, role: 'MEMBER' })
 *   await loginAs(context, userId, 'MEMBER')
 *   await page.goto('/feed')
 */
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import type { BrowserContext } from '@playwright/test'

const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = _require('@prisma/client') as any
export const prisma = new PrismaClient()

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export type Role = 'OWNER' | 'PROGRAMMER' | 'COACH' | 'MEMBER'

interface LoginOptions {
  /**
   * When true (default) sets the user's `onboardedAt` so the RequireOnboarded
   * guard doesn't redirect to /onboarding. Specs that need a not-yet-onboarded
   * fixture (onboarding.spec.ts) pass `false`.
   */
  markOnboarded?: boolean
}

/**
 * Sign a refresh token, persist it as a `RefreshToken` row, and add the cookie
 * to the given browser context. The cookie domain is `localhost`, matching how
 * the API issues the cookie in dev. AuthProvider's mount-time refresh consumes
 * the cookie and the page lands authenticated.
 */
export async function loginAs(
  context: BrowserContext,
  userId: string,
  role: Role,
  options: LoginOptions = {},
) {
  const secret = process.env.JWT_REFRESH_SECRET
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not set; ensure tests run via dotenv-cli')

  // jti makes each token unique even when minted within the same second for
  // the same user — RefreshToken.token has a unique constraint, so without
  // this two parallel tests collide.
  const token = jwt.sign({ sub: userId, role, jti: randomUUID() }, secret, { expiresIn: '7d' })
  await prisma.refreshToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + REFRESH_EXPIRY_MS) },
  })

  // Slice B (#122) introduced a RequireOnboarded redirect for users with null
  // onboardedAt. Existing specs seed minimal users and would otherwise bounce
  // to /onboarding. Default-on so legacy tests stay green; opt out for specs
  // that need to drive the onboarding flow itself.
  if (options.markOnboarded !== false) {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date() },
    })
  }

  await context.addCookies([{
    name: 'refreshToken',
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }])
}
