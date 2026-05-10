import Keycloak from 'keycloak-js'

const keycloak = new Keycloak({
  url: window.location.origin + '/auth',
  realm: 'wodalytics',
  clientId: 'wodalytics-web',
})

export default keycloak
