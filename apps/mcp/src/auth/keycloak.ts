import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Request, Response, NextFunction } from 'express'
import type { Role } from '@wodalytics/db'

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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice(7)
  try {
    const { payload } = await jwtVerify(token, jwks(), {
      issuer: issuerUrl(),
      algorithms: ['RS256'],
    })
    const userId = payload['wodalytics_user_id']
    const role = payload['wodalytics_role']
    if (typeof userId !== 'string' || typeof role !== 'string') {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    req.user = { id: userId, role: role as Role }
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
