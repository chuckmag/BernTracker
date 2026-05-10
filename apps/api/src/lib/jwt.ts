import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Role } from '@wodalytics/db'

const ACCESS_EXPIRY = '15m'
const REFRESH_EXPIRY = '7d'

function secret(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

// jti makes each token unique even when minted within the same second for the
// same (sub, role) pair. RefreshToken.token has a unique constraint, so two
// concurrent refreshes for one user (e.g. two tabs) would otherwise collide.
export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role, jti: randomUUID() }, secret('JWT_SECRET'), { expiresIn: ACCESS_EXPIRY })
}

export function signRefreshToken(userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role, jti: randomUUID() }, secret('JWT_REFRESH_SECRET'), { expiresIn: REFRESH_EXPIRY })
}

export function signTokenPair(userId: string, role: Role) {
  return {
    accessToken: signAccessToken(userId, role),
    refreshToken: signRefreshToken(userId, role),
  }
}

export function verifyAccessToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, secret('JWT_SECRET')) as { sub: string; role: Role }
  return { sub: payload.sub, role: payload.role }
}

export function verifyRefreshToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, secret('JWT_REFRESH_SECRET')) as { sub: string; role: Role }
  return { sub: payload.sub, role: payload.role }
}

// Decode the `iss` claim without verification — used to route to the correct
// verifier without a second full parse. Malformed tokens return undefined.
export function getTokenIssuer(token: string): string | undefined {
  try {
    const decoded = jwt.decode(token) as { iss?: string } | null
    return decoded?.iss
  } catch {
    return undefined
  }
}

// Lazily initialized so the module loads without KEYCLOAK_ISSUER_URL set
// (e.g. integration tests that only exercise the legacy JWT path).
let _keycloakJWKS: ReturnType<typeof createRemoteJWKSet> | null = null

function keycloakIssuer(): string {
  const url = process.env.KEYCLOAK_ISSUER_URL
  if (!url) throw new Error('Missing env var: KEYCLOAK_ISSUER_URL')
  return url
}

function keycloakJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_keycloakJWKS) {
    _keycloakJWKS = createRemoteJWKSet(
      new URL(`${keycloakIssuer()}/protocol/openid-connect/certs`),
    )
  }
  return _keycloakJWKS
}

export type KeycloakClaims =
  | { provisioned: true; userId: string; role: Role }
  | { provisioned: false; sub: string; email: string; name: string | null }

export async function verifyKeycloakToken(token: string): Promise<KeycloakClaims> {
  const { payload } = await jwtVerify(token, keycloakJWKS(), {
    issuer: keycloakIssuer(),
    algorithms: ['RS256'],
  })

  // Fast path: token has our custom claims (set after the Keycloak user is
  // provisioned in our DB and the attributes are written back to Keycloak).
  const userId = payload['wodalytics_user_id']
  const role = payload['wodalytics_role']
  if (typeof userId === 'string' && typeof role === 'string') {
    return { provisioned: true, userId, role: role as Role }
  }

  // First-login path: custom attributes not yet on the Keycloak user. Fall
  // back to the standard OIDC claims so requireAuth can provision via email.
  const sub = payload.sub
  const email = payload['email']
  const name = payload['name']
  if (typeof sub !== 'string') throw new Error('Keycloak token missing sub claim')
  if (typeof email !== 'string') throw new Error('Keycloak token missing email claim — ensure email scope is in the client defaultClientScopes')
  return {
    provisioned: false,
    sub,
    email,
    name: typeof name === 'string' ? name : null,
  }
}
