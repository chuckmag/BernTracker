import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@berntracker/db'
import { verifyAccessToken } from '../lib/jwt.js'
import { createLogger, Log } from '../lib/logger.js'

const log = createLogger('auth')

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    log(Log.WARNING, req, `requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const token = header.slice(7)
  try {
    const { sub, role } = verifyAccessToken(token)
    req.user = { id: sub, role }
    next()
  } catch (err) {
    log(Log.WARNING, req, `requireAuth: token verification failed — ${req.method} ${req.path}`, err instanceof Error ? err.message : err)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      log(Log.WARNING, req, `requireRole: access denied — ${req.method} ${req.path} — userId=${req.user?.id ?? 'none'} role=${req.user?.role ?? 'none'} required=${roles.join('|')}`)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
