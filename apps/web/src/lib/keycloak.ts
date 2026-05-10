import Keycloak from 'keycloak-js'

// VITE_KEYCLOAK_URL lets you point directly at a local Keycloak instance
// (e.g. http://localhost:8180/auth) without going through the nginx /auth proxy.
// In production/QA the var is unset and the SPA uses its own origin + /auth,
// which nginx proxies to the Keycloak Railway service.
const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL ?? (window.location.origin + '/auth')

const keycloak = new Keycloak({
  url: keycloakUrl,
  realm: 'wodalytics',
  clientId: 'wodalytics-web',
})

export default keycloak
