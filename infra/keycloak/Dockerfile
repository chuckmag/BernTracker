FROM quay.io/keycloak/keycloak:26.2

# keycloak-config-cli reconciles the full realm on every boot — clients,
# roles, IDPs, clientScopes, authentication flows, and realm-level settings
# (loginTheme, token timeouts, etc.). Users and sessions are never touched.
# The Keycloak image already ships a JVM, so no extra runtime is needed.
USER root
RUN curl -sL https://github.com/adorsys/keycloak-config-cli/releases/download/v6.5.0/keycloak-config-cli-26.5.4.jar \
    -o /keycloak-config-cli.jar
USER keycloak

COPY realm-wodalytics.json /realm-template.json
COPY themes/wodalytics /opt/keycloak/themes/wodalytics
COPY docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]
