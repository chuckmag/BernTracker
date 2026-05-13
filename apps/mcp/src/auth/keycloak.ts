// Thin re-export for test compatibility. The MCP app delegates all Keycloak
// auth logic to @wodalytics/server; this module exists so tests that import
// from '../src/auth/keycloak.js' keep working without change.
export { resetKeycloakJwksCache as resetJwksCache, requireKeycloakAuth as requireAuth } from '@wodalytics/server'
