import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@wodalytics/db'
import { prisma } from '@wodalytics/db'
import { verifyAccessToken } from '../lib/jwt.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('auth')

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    log.warning(req, `requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const token = header.slice(7)
  try {
    const { sub, role } = verifyAccessToken(token)
    req.user = { id: sub, role }
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

export async function requireMovementReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const reviewerEmail = process.env.MOVEMENT_REVIEWER_EMAIL
  if (!reviewerEmail) {
    log.warning(req, `requireMovementReviewer: MOVEMENT_REVIEWER_EMAIL not set — ${req.method} ${req.path}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } })
  if (user?.email !== reviewerEmail) {
    log.warning(req, `requireMovementReviewer: access denied — ${req.method} ${req.path} — userId=${req.user?.id}`)
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
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
