import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@wodalytics/db'
import { prisma } from '@wodalytics/db'
import { verifyAccessToken, getTokenIssuer } from '../lib/jwt.js'
import { verifyKeycloakToken, createLogger } from '@wodalytics/server'
import type { KeycloakClaims } from '@wodalytics/server'

const log = createLogger('auth')

// Provisions a WODalytics user from a first-login Keycloak token (one that
// lacks the custom wodalytics_user_id / wodalytics_role claims). Mirrors the
// findOrCreateGoogleUser pattern in routes/auth.ts: OAuthAccount links the
// Keycloak sub to our internal user ID; email is the tie-breaker for accounts
// that pre-dated Keycloak (e.g., migrated users whose email already exists).
async function findOrCreateKeycloakUser(
  claims: Extract<KeycloakClaims, { provisioned: false }>,
): Promise<{ id: string; role: Role }> {
  if (!claims.email) {
    throw new Error('Keycloak token missing email claim — cannot provision user without email')
  }

  const existing = await prisma.oAuthAccount.findUnique({
    where: { provider_providerId: { provider: 'keycloak', providerId: claims.sub } },
    select: { user: { select: { id: true, role: true } } },
  })
  if (existing) return existing.user

  const existingByEmail = await prisma.user.findUnique({
    where: { email: claims.email },
    select: { id: true, role: true },
  })
  if (existingByEmail) {
    await prisma.oAuthAccount.create({
      data: { userId: existingByEmail.id, provider: 'keycloak', providerId: claims.sub },
    })
    return existingByEmail
  }

  const newUser = await prisma.user.create({
    data: {
      email: claims.email,
      name: claims.name,
      oauthAccounts: { create: { provider: 'keycloak', providerId: claims.sub } },
    },
    select: { id: true, role: true },
  })
  return newUser
}

// Dual-validation window: accepts both Keycloak-issued tokens (RS256, verified
// via JWKS) and legacy WODalytics tokens (HS256, verified via JWT_SECRET).
// Issuer is read from the unverified token payload to pick the correct path —
// an attacker cannot spoof this to downgrade to the weaker path because each
// verifier independently checks the signature with its own key material.
// Remove the legacy branch once web + mobile have migrated to Keycloak (#328).
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    log.warning(req, `requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const token = header.slice(7)
  try {
    const iss = getTokenIssuer(token)
    if (iss === process.env.KEYCLOAK_ISSUER_URL) {
      const claims = await verifyKeycloakToken(token)
      if (claims.provisioned) {
        req.user = { id: claims.userId, role: claims.role, isWodalyticsAdmin: claims.isWodalyticsAdmin }
      } else {
        const user = await findOrCreateKeycloakUser(claims)
        req.user = { id: user.id, role: user.role, isWodalyticsAdmin: claims.isWodalyticsAdmin }
      }
    } else {
      const { sub, role } = verifyAccessToken(token)
      req.user = { id: sub, role, isWodalyticsAdmin: false }
    }
    next()
  } catch (err) {
    log.warning(req, `requireAuth: token verification failed — ${req.method} ${req.path}`, err instanceof Error ? err.message : err)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role || !roles.includes(req.user.role)) {
      log.warning(req, `requireRole: access denied — ${req.method} ${req.path} — userId=${req.user?.id ?? 'none'} role=${req.user?.role ?? 'none'} required=${roles.join('|')}`)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

// Admin status comes from the Keycloak 'admin' realm role surfaced via the
// wodalytics:admin scope's realm-roles protocol mapper. Legacy JWT tokens are
// always non-admin (isWodalyticsAdmin: false).
export function requireWodalyticsAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.isWodalyticsAdmin) {
    log.warning(req, `requireWodalyticsAdmin: access denied — ${req.method} ${req.path} — userId=${req.user?.id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
