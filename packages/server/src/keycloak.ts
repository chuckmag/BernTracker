import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose'
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

export async function verifyKeycloakToken(token: string): Promise<KeycloakClaims> {
  const { payload } = await jwtVerify(token, keycloakJWKS(), {
    issuer: keycloakIssuer(),
    algorithms: ['RS256'],
  })

  const userId = payload['wodalytics_user_id']
  const role = payload['wodalytics_role']
  if (typeof userId === 'string' && typeof role === 'string') {
    return { provisioned: true, userId, role: role as Role }
  }

  const sub = payload.sub
  if (typeof sub !== 'string') {
    // Debug: decode without verification to inspect actual token structure
    try {
      const raw = decodeJwt(token)
      console.log(
        `[keycloak] debug verified-but-no-sub: iss=${raw.iss} typ=${raw['typ']} azp=${raw['azp']} ` +
          `scope=${raw['scope']} sub_type=${typeof raw.sub} sub_val=${raw.sub} ` +
          `keys=${Object.keys(raw).join(',')}`,
      )
    } catch {
      console.log('[keycloak] debug verified-but-no-sub: could not decode JWT')
    }
    throw new Error('Keycloak token missing sub claim')
  }

  return {
    provisioned: false,
    sub,
    email: typeof payload['email'] === 'string' ? payload['email'] : null,
    name: typeof payload['name'] === 'string' ? payload['name'] : null,
  }
}
