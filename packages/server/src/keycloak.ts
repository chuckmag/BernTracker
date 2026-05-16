import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Role } from '@wodalytics/db'

// Lazily initialized so the module loads without KEYCLOAK_ISSUER_URL set.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export function keycloakIssuer(): string {
  const url = process.env.KEYCLOAK_ISSUER_URL
  if (!url) throw new Error('Missing env var: KEYCLOAK_ISSUER_URL')
  return url
}

function keycloakJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`${keycloakIssuer()}/protocol/openid-connect/certs`))
  }
  return _jwks
}

/** Reset the cached JWKS getter — for use in tests only. */
export function resetKeycloakJwksCache(): void {
  _jwks = null
}

/**
 * A provisioned token carries the WODalytics custom claims written back to
 * Keycloak after the user is created in our DB. An unprovisioned token is a
 * first-login token that has only standard OIDC claims.
 *
 * `email` is nullable on the unprovisioned branch because DCR clients (e.g.
 * Claude.ai) may not request the email scope. Services that need email to
 * provision a user (the API) must guard against null and return an appropriate
 * error; services that only need identity (the MCP server) can fall back to sub.
 */
export type KeycloakClaims =
  | { provisioned: true; userId: string; role: Role }
  | { provisioned: false; sub: string; email: string | null; name: string | null }

// Keycloak 21+ creates DCR-registered clients with lightweight access tokens
// enabled by default. Lightweight tokens omit sub (and custom claims) from the
// access token payload. The UserInfo endpoint always returns sub for any valid
// OIDC access token, so we fall back to it when sub is absent. Cache by jti
// (unique per token) to avoid one round-trip per request.
type _UserInfoEntry = {
  sub: string
  wodalyticsUserId?: string
  wodalyticsRole?: string
  email?: string
  name?: string
  exp: number
}
const _userInfoCache = new Map<string, _UserInfoEntry>()

async function _fetchUserInfo(token: string, jti: string, exp: number): Promise<_UserInfoEntry | null> {
  const cached = _userInfoCache.get(jti)
  if (cached && cached.exp > Date.now() / 1000) return cached

  // Prune expired entries on cache miss
  const now = Date.now() / 1000
  for (const [k, v] of _userInfoCache) {
    if (v.exp < now) _userInfoCache.delete(k)
  }

  try {
    const resp = await fetch(`${keycloakIssuer()}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return null
    const info = (await resp.json()) as Record<string, unknown>
    const sub = typeof info['sub'] === 'string' ? info['sub'] : null
    if (!sub) return null
    const entry: _UserInfoEntry = {
      sub,
      exp,
      wodalyticsUserId: typeof info['wodalytics_user_id'] === 'string' ? info['wodalytics_user_id'] : undefined,
      wodalyticsRole: typeof info['wodalytics_role'] === 'string' ? info['wodalytics_role'] : undefined,
      email: typeof info['email'] === 'string' ? info['email'] : undefined,
      name: typeof info['name'] === 'string' ? info['name'] : undefined,
    }
    _userInfoCache.set(jti, entry)
    return entry
  } catch {
    return null
  }
}

export async function verifyKeycloakToken(token: string): Promise<KeycloakClaims> {
  const { payload } = await jwtVerify(token, keycloakJWKS(), {
    issuer: keycloakIssuer(),
    algorithms: ['RS256'],
    clockTolerance: 60, // 60-second tolerance for clock skew between Railway and Keycloak
  })

  // Fast path: provisioned token carries custom claims in the access token.
  const userId = payload['wodalytics_user_id']
  const role = payload['wodalytics_role']
  if (typeof userId === 'string' && typeof role === 'string') {
    return { provisioned: true, userId, role: role as Role }
  }

  // Standard path: sub is present in the access token.
  const sub = payload.sub
  if (typeof sub === 'string') {
    return {
      provisioned: false,
      sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : null,
      name: typeof payload['name'] === 'string' ? payload['name'] : null,
    }
  }

  // Lightweight access token path: sub absent, fall back to UserInfo endpoint.
  const scopeStr = typeof payload['scope'] === 'string' ? payload['scope'] : ''
  const jti = payload.jti
  const exp = payload.exp
  if (scopeStr.includes('openid') && typeof jti === 'string' && typeof exp === 'number') {
    const info = await _fetchUserInfo(token, jti, exp)
    if (info) {
      if (typeof info.wodalyticsUserId === 'string' && typeof info.wodalyticsRole === 'string') {
        return { provisioned: true, userId: info.wodalyticsUserId, role: info.wodalyticsRole as Role }
      }
      return {
        provisioned: false,
        sub: info.sub,
        email: info.email ?? null,
        name: info.name ?? null,
      }
    }
  }

  throw new Error(
    `Keycloak token missing sub claim (scope=${scopeStr} jti=${typeof jti} exp=${typeof exp})`,
  )
}
