const KEYCLOAK_URL = process.env.EXPO_PUBLIC_KEYCLOAK_URL ?? 'https://qa.wodalytics.com/auth'
const REALM = 'wodalytics'

export const CLIENT_ID = 'wodalytics-mobile'

export const discovery = {
  authorizationEndpoint: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth`,
  tokenEndpoint: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
  revocationEndpoint: `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/revoke`,
}
