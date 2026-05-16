#!/bin/bash
# Substitutes __GOOGLE_IDP_CLIENT_ID__ and __GOOGLE_IDP_CLIENT_SECRET__ in the
# realm template before Keycloak starts, so the Google IDP is fully configured
# on first boot without manual admin console steps. If the vars are unset the
# placeholders remain and Google sign-in will fail with invalid_client — that's
# intentional (you haven't configured it for this environment).
set -euo pipefail

mkdir -p /opt/keycloak/data/import

content=$(<"/realm-template.json")
content="${content//__GOOGLE_IDP_CLIENT_ID__/${GOOGLE_IDP_CLIENT_ID:-__GOOGLE_IDP_CLIENT_ID__}}"
content="${content//__GOOGLE_IDP_CLIENT_SECRET__/${GOOGLE_IDP_CLIENT_SECRET:-__GOOGLE_IDP_CLIENT_SECRET__}}"
printf '%s\n' "$content" > /opt/keycloak/data/import/realm-wodalytics.json

exec /opt/keycloak/bin/kc.sh "$@"
