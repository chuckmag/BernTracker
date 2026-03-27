import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@berntracker/db'
import { verifyAccessToken } from '../lib/jwt.js'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  const token = header.slice(7)
  try {
    const { sub, role } = verifyAccessToken(token)
    req.user = { id: sub, role }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log("User and Roles are not valid, user and expected role:", req.user, roles)
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    next()
  }
}
