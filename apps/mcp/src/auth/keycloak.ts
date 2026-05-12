import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@wodalytics/db'
import { createLogger } from '../lib/logger.js'

const log = createLogger('auth')

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function issuerUrl(): string {
  const url = process.env.KEYCLOAK_ISSUER_URL
  if (!url) throw new Error('Missing env var: KEYCLOAK_ISSUER_URL')
  return url
}

function jwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`${issuerUrl()}/protocol/openid-connect/certs`))
  }
  return _jwks
}

/** Reset the cached JWKS getter — for use in tests only. */
export function resetJwksCache(): void {
  _jwks = null
}

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
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: issuerUrl(),
      algorithms: ['RS256'],
    })

    // sub is always present on a valid Keycloak JWT
    const sub = payload.sub
    if (!sub) {
      log.warning(req, `requireAuth: token missing sub claim — ${req.method} ${req.path}`)
      unauthorized(res)
      return
    }

    // wodalytics_user_id / wodalytics_role come from the wodalytics-claims scope.
    // DCR clients (e.g. Claude.ai) may not have that scope assigned yet — fall back
    // to the Keycloak sub so the request still passes auth. Tools that need the
    // WODalytics DB user ID must check req.user.id is not a raw Keycloak sub.
    const userId = payload['wodalytics_user_id']
    const role = payload['wodalytics_role']

    if (typeof userId !== 'string') {
      log.warning(req, `requireAuth: token has no wodalytics_user_id — using Keycloak sub as fallback. Scopes: ${payload.scope ?? '(none)'}`)
    }

    req.user = {
      id: typeof userId === 'string' ? userId : sub,
      role: typeof role === 'string' ? (role as Role) : undefined,
    }

    next()
  } catch (err) {
    log.warning(req, `requireAuth: JWT verification failed — ${req.method} ${req.path} — ${err instanceof Error ? err.message : String(err)}`)
    unauthorized(res)
  }
}
