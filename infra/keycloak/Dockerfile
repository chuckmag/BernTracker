# Download stage: alpine has wget; the Keycloak base image (UBI Micro) does not.
# Use the keycloak-config-cli JAR built against Keycloak 26.5.4 (closest ≤ 26.6).
# The JAR version must be <= the Keycloak server version — using a newer JAR against
# an older KC server causes 400 errors because the Admin Client serializes
# RealmRepresentation fields the older server doesn't recognise.
# When upgrading Keycloak, pick the closest JAR version at or below the
# new KC version from https://github.com/adorsys/keycloak-config-cli/releases
FROM alpine:3.20 AS downloader
ARG TARGETARCH
RUN wget -q https://github.com/adorsys/keycloak-config-cli/releases/download/v6.5.0/keycloak-config-cli-26.5.4.jar \
    -O /keycloak-config-cli.jar

# BCrypt PasswordHashProvider — Keycloak 26 ships with PBKDF2 providers only.
# Without this JAR, Keycloak stores imported bcrypt credentials but cannot verify
# them at login time (no provider handles algorithm=bcrypt). The PasswordHashProvider
# SPI has been stable since KC 14, so this KC-22-targeted build works on KC 26.
RUN wget -q "https://github.com/inventage/keycloak-password-hashprovider-extension/releases/download/2.0.0/extension-password-hashprovider-2.0.0-202307200659-6-d59b2187.jar" \
    -O /bcrypt-provider.jar

# jq — statically linked, no libc dependency, so it runs on UBI Micro.
# Used in docker-entrypoint.sh to strip identityProviders from the realm JSON
# when Google IDP credentials are absent, avoiding placeholder-string imports.
RUN wget -q "https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-${TARGETARCH}" \
    -O /jq && chmod +x /jq

FROM quay.io/keycloak/keycloak:26.6

# keycloak-config-cli reconciles the full realm on every boot — clients,
# roles, IDPs, clientScopes, authentication flows, and realm-level settings
# (loginTheme, token timeouts, etc.). Users and sessions are never touched.
# The Keycloak image already ships a JVM, so no extra runtime is needed.
COPY --from=downloader /keycloak-config-cli.jar /keycloak-config-cli.jar
COPY --from=downloader /bcrypt-provider.jar /opt/keycloak/providers/bcrypt-provider.jar
COPY --from=downloader /jq /usr/local/bin/jq

COPY realm-wodalytics.json /realm-template.json
COPY themes/wodalytics /opt/keycloak/themes/wodalytics
COPY docker-entrypoint.sh /docker-entrypoint.sh

# The health check hits the wodalytics realm's OIDC discovery endpoint rather
# than Keycloak's generic /health/ready. This matters because the entrypoint
# starts KC in the background and then runs keycloak-config-cli to reconcile
# the realm — KC is HTTP-ready before the realm sync completes. The realm
# endpoint returns 404 until keycloak-config-cli creates/updates the realm,
# so Railway won't mark the deployment healthy until realm sync is done.
# start-period covers the ~30s KC startup + ~10s config-cli sync with margin.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
  CMD curl -sf "http://localhost:8080${KC_HTTP_RELATIVE_PATH:-/auth}/realms/wodalytics/.well-known/openid-configuration" > /dev/null

ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]
