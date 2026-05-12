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
        req.user = { id: claims.userId, role: claims.role }
      } else {
        const user = await findOrCreateKeycloakUser(claims)
        req.user = { id: user.id, role: user.role }
      }
    } else {
      const { sub, role } = verifyAccessToken(token)
      req.user = { id: sub, role }
    }
    next()
  } catch (err) {
    log.warning(req, `requireAuth: token verification failed — ${req.method} ${req.path}`, err instanceof Error ? err.message : err)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      log.warning(req, `requireRole: access denied — ${req.method} ${req.path} — userId=${req.user?.id ?? 'none'} role=${req.user?.role ?? 'none'} required=${roles.join('|')}`)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}

// Parses WODALYTICS_ADMIN_EMAILS (comma-separated) into a Set of trimmed,
// lower-cased emails. Empty / unset env → empty Set, which makes every
// requireWodalyticsAdmin call deny by default (intended).
export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)
  return allowed.has(email.toLowerCase())
}

export async function requireWodalyticsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const allowed = parseAdminEmails(process.env.WODALYTICS_ADMIN_EMAILS)
  if (allowed.size === 0) {
    log.warning(req, `requireWodalyticsAdmin: WODALYTICS_ADMIN_EMAILS not set — ${req.method} ${req.path}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } })
  if (!user?.email || !allowed.has(user.email.toLowerCase())) {
    log.warning(req, `requireWodalyticsAdmin: access denied — ${req.method} ${req.path} — userId=${req.user?.id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
