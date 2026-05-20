#!/bin/bash
# Keycloak entrypoint with full realm reconciliation via keycloak-config-cli.
#
# On every boot:
#   1. Substitutes __GOOGLE_IDP_CLIENT_ID__ / __GOOGLE_IDP_CLIENT_SECRET__
#      in the realm template.
#   2. Starts Keycloak in the background.
#   3. Runs keycloak-config-cli with availability-check enabled — it waits
#      for Keycloak to be ready (up to 3 min), then reconciles the full realm
#      JSON: clients, roles, IDPs, clientScopes, authentication flows, and
#      realm-level settings (loginTheme, token timeouts, etc.).
#      Users and active sessions are never touched.
#
# keycloak-config-cli applies what is in the JSON and leaves everything else
# alone (--import.remote-state.enabled=false). To remove a resource from
# Keycloak, delete it manually in the admin UI and remove it from the JSON.
set -euo pipefail

REALM_TEMPLATE=/realm-template.json
REALM_FILE=/tmp/realm-wodalytics.json
KC_RELATIVE_PATH="${KC_HTTP_RELATIVE_PATH:-}"
KC_MAIN_URL="http://localhost:8080${KC_RELATIVE_PATH}"

# Support both Keycloak 22+ env var names and the legacy names still in use
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-${KEYCLOAK_ADMIN:-admin}}"
ADMIN_PASS="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

log() { echo "[entrypoint] $*"; }

# ── 1. Substitute Google IDP credentials in realm template ───────────────────
# If the env vars are absent, pass --import.managed.identity-provider=IGNORE
# so keycloak-config-cli skips IDPs entirely and leaves whatever is already
# in Keycloak untouched, rather than overwriting with placeholder strings.
log "Preparing realm JSON..."
content=$(<"${REALM_TEMPLATE}")
IDP_MANAGED_FLAG=""
if [[ -n "${GOOGLE_IDP_CLIENT_ID:-}" && -n "${GOOGLE_IDP_CLIENT_SECRET:-}" ]]; then
  content="${content//__GOOGLE_IDP_CLIENT_ID__/${GOOGLE_IDP_CLIENT_ID}}"
  content="${content//__GOOGLE_IDP_CLIENT_SECRET__/${GOOGLE_IDP_CLIENT_SECRET}}"
  log "Google IDP credentials substituted"
else
  # Strip identityProviders and identityProviderMappers so config-cli never
  # imports placeholder strings into Keycloak. NO_DELETE tells config-cli not
  # to remove any IDP that is already present in Keycloak but absent from JSON.
  # (IGNORE was removed in keycloak-config-cli v6.x; valid values: FULL, NO_DELETE)
  content="$(printf '%s' "$content" | /usr/local/bin/jq 'del(.identityProviders, .identityProviderMappers)')"
  IDP_MANAGED_FLAG="--import.managed.identity-provider=NO_DELETE"
  log "GOOGLE_IDP_CLIENT_ID/SECRET not set — identity providers stripped from import (existing KC config preserved)"
fi

# Substitute SMTP password (Google Workspace app password) into the realm
# template. When SMTP_PASSWORD is absent, strip the smtpServer block entirely
# so config-cli doesn't push the placeholder string to Keycloak — the realm
# will simply have no SMTP configured and password-reset emails won't send.
if [[ -n "${SMTP_PASSWORD:-}" ]]; then
  content="${content//__SMTP_PASSWORD__/${SMTP_PASSWORD}}"
  log "SMTP password substituted"
else
  content="$(printf '%s' "$content" | /usr/local/bin/jq 'del(.smtpServer)')"
  log "SMTP_PASSWORD not set — smtpServer stripped from import (email sending disabled)"
fi
printf '%s\n' "$content" > "${REALM_FILE}"

# ── 2. Start Keycloak in the background ──────────────────────────────────────
# KC_START_COMMAND defaults to "start" (production). Override to "start-dev"
# for local testing without a production database.
KC_START_COMMAND="${KC_START_COMMAND:-start}"

# cimd (Client ID Metadata Document) is an opt-in feature in KC 26.6+.
# Without it the client-id-metadata-document executor is unregistered and
# realm import fails with "no executor provider found". Append to whatever
# KC_FEATURES is already set to (e.g. token-exchange from Railway env).
KC_FEATURES="${KC_FEATURES:+${KC_FEATURES},}cimd"
export KC_FEATURES

log "Starting Keycloak (${KC_START_COMMAND})..."
/opt/keycloak/bin/kc.sh ${KC_START_COMMAND} &
KC_PID=$!

# Forward SIGTERM/SIGINT so Railway can shut the container down cleanly
trap 'log "Forwarding shutdown signal to Keycloak"; kill "$KC_PID" 2>/dev/null' SIGTERM SIGINT

# ── 3. Reconcile realm via keycloak-config-cli ───────────────────────────────
# --keycloak.availability-check.enabled waits for Keycloak to accept
# connections before running the import (up to PT3M = 3 minutes), so
# no separate health-check polling loop is needed.
log "Waiting for Keycloak, then reconciling realm config..."
java -jar /keycloak-config-cli.jar \
  --keycloak.url="${KC_MAIN_URL}" \
  --keycloak.user="${ADMIN_USER}" \
  --keycloak.password="${ADMIN_PASS}" \
  --import.files.locations="${REALM_FILE}" \
  --import.var-substitution.enabled=false \
  --import.remote-state.enabled=false \
  --keycloak.availability-check.enabled=true \
  --keycloak.availability-check.timeout=PT3M \
  ${IDP_MANAGED_FLAG}
log "Realm reconciliation complete"

# ── 4. Stay alive until Keycloak exits ───────────────────────────────────────
log "Handing off to Keycloak (PID ${KC_PID})"
wait "$KC_PID"
