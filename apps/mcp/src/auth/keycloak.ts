import type { Request, Response, NextFunction } from 'express'
import { verifyKeycloakToken, createLogger } from '@wodalytics/server'

const log = createLogger('auth')

function unauthorized(res: Response): void {
  res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Unauthorized' })
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    log.warning(req, `requireAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
    unauthorized(res)
    return
  }
  const token = header.slice(7)
  try {
    const claims = await verifyKeycloakToken(token)
    if (claims.provisioned) {
      req.user = { id: claims.userId, role: claims.role }
    } else {
      // DCR clients (e.g. Claude.ai) receive a valid Keycloak JWT but without
      // WODalytics custom claims until the user has registered via the web/mobile
      // app. Fall back to the Keycloak sub so the request still passes auth;
      // tools that need the DB user ID must check whether req.user.role is set.
      log.warning(req, `requireAuth: token not yet provisioned — using Keycloak sub as fallback (sub=${claims.sub})`)
      req.user = { id: claims.sub, role: undefined }
    }
    next()
  } catch (err) {
    log.warning(req, `requireAuth: JWT verification failed — ${req.method} ${req.path} — ${err instanceof Error ? err.message : String(err)}`)
    unauthorized(res)
  }
}
