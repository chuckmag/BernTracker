# Download stage: alpine has wget; the Keycloak base image (UBI Micro) does not.
# Use the keycloak-config-cli JAR built against Keycloak 26.5.4. The JAR
# version must be <= the Keycloak server version — using a newer JAR against
# an older KC server causes 400 errors because the Admin Client serializes
# RealmRepresentation fields the older server doesn't recognise.
# When upgrading Keycloak, pick the closest JAR version at or below the
# new KC version from https://github.com/adorsys/keycloak-config-cli/releases
FROM alpine:3.20 AS downloader
RUN wget -q https://github.com/adorsys/keycloak-config-cli/releases/download/v6.5.0/keycloak-config-cli-26.5.4.jar \
    -O /keycloak-config-cli.jar

# BCrypt PasswordHashProvider — Keycloak 26 ships with PBKDF2 providers only.
# Without this JAR, Keycloak stores imported bcrypt credentials but cannot verify
# them at login time (no provider handles algorithm=bcrypt). The PasswordHashProvider
# SPI has been stable since KC 14, so this KC-22-targeted build works on KC 26.
RUN wget -q "https://github.com/inventage/keycloak-password-hashprovider-extension/releases/download/2.0.0/extension-password-hashprovider-2.0.0-202307200659-6-d59b2187.jar" \
    -O /bcrypt-provider.jar

FROM quay.io/keycloak/keycloak:26.5

# keycloak-config-cli reconciles the full realm on every boot — clients,
# roles, IDPs, clientScopes, authentication flows, and realm-level settings
# (loginTheme, token timeouts, etc.). Users and sessions are never touched.
# The Keycloak image already ships a JVM, so no extra runtime is needed.
COPY --from=downloader /keycloak-config-cli.jar /keycloak-config-cli.jar
COPY --from=downloader /bcrypt-provider.jar /opt/keycloak/providers/bcrypt-provider.jar

COPY realm-wodalytics.json /realm-template.json
COPY themes/wodalytics /opt/keycloak/themes/wodalytics
COPY docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]
