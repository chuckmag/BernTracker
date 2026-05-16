import type { Request, Response, NextFunction } from 'express'
import { verifyKeycloakToken } from './keycloak.js'
import { createLogger } from './logger.js'

const log = createLogger('auth')

function unauthorized(res: Response): void {
  res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: 'Unauthorized' })
}

/**
 * Express middleware that validates a Keycloak-issued Bearer JWT and populates
 * req.user. Suitable for services that accept Keycloak tokens only (e.g. the
 * MCP server, future micro-services).
 *
 * Provisioned tokens (wodalytics_user_id + wodalytics_role present) set both
 * req.user.id and req.user.role. Unprovisioned tokens (first login or DCR
 * clients without the wodalytics-claims scope) fall back to the Keycloak sub
 * as req.user.id with role undefined — the caller's tools can decide whether
 * to require a fully provisioned user.
 *
 * The API uses its own requireAuth (apps/api/src/middleware/auth.ts) because
 * it also handles the legacy HS256 JWT path and DB user provisioning.
 */
export async function requireKeycloakAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    log.warning(req, `requireKeycloakAuth: missing or malformed Authorization header — ${req.method} ${req.path}`)
    unauthorized(res)
    return
  }
  const token = header.slice(7)
  try {
    const claims = await verifyKeycloakToken(token)
    if (claims.provisioned) {
      req.user = { id: claims.userId, role: claims.role }
    } else {
      log.warning(req, `requireKeycloakAuth: token not yet provisioned — using Keycloak sub as fallback (sub=${claims.sub})`)
      req.user = { id: claims.sub, role: undefined }
    }
    next()
  } catch (err) {
    log.warning(req, `requireKeycloakAuth: JWT verification failed — ${req.method} ${req.path} — ${err instanceof Error ? err.message : String(err)}`)
    unauthorized(res)
  }
}
