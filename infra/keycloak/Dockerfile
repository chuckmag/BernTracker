FROM quay.io/keycloak/keycloak:26.2

# jq is required by docker-entrypoint.sh to build the partialImport payload
USER root
RUN curl -sL https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-linux-amd64 \
    -o /usr/local/bin/jq && chmod +x /usr/local/bin/jq
USER keycloak

COPY realm-wodalytics.json /realm-template.json
COPY themes/wodalytics /opt/keycloak/themes/wodalytics
COPY docker-entrypoint.sh /docker-entrypoint.sh

# docker-entrypoint.sh: substitutes Google IDP credentials, starts Keycloak
# in the background, waits for readiness, then reconciles realm-wodalytics.json
# via Admin REST API (full import on first boot; partialImport+OVERWRITE on
# subsequent boots so realm JSON changes are applied without wiping users).
ENTRYPOINT ["/bin/bash", "/docker-entrypoint.sh"]
