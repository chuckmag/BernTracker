#!/bin/bash
# Keycloak entrypoint with full realm reconciliation via keycloak-config-cli.
#
# On every boot:
#   1. Substitutes __GOOGLE_IDP_CLIENT_ID__ / __GOOGLE_IDP_CLIENT_SECRET__
#      in the realm template.
#   2. Starts Keycloak in the background and waits for it to be ready.
#   3. Runs keycloak-config-cli, which reconciles the full realm JSON against
#      the running Keycloak instance: clients, roles, IDPs, clientScopes,
#      authentication flows, and realm-level settings (loginTheme, token
#      timeouts, etc.). Users and active sessions are never touched.
#
# keycloak-config-cli applies what is in the JSON and leaves everything else
# alone (--import.remote-state.enabled=false). To remove a resource from
# Keycloak, delete it manually in the admin UI and remove it from the JSON.
set -euo pipefail

REALM_TEMPLATE=/realm-template.json
REALM_FILE=/tmp/realm-wodalytics.json
KC_RELATIVE_PATH="${KC_HTTP_RELATIVE_PATH:-}"
KC_MAIN_URL="http://localhost:8080${KC_RELATIVE_PATH}"
KC_MGMT_URL="http://localhost:9000"

# Support both Keycloak 22+ env var names and the legacy names still in use
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-${KEYCLOAK_ADMIN:-admin}}"
ADMIN_PASS="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

log() { echo "[entrypoint] $*"; }

# ── 1. Substitute Google IDP credentials in realm template ───────────────────
log "Preparing realm JSON (substituting Google IDP credentials)..."
content=$(<"${REALM_TEMPLATE}")
content="${content//__GOOGLE_IDP_CLIENT_ID__/${GOOGLE_IDP_CLIENT_ID:-__GOOGLE_IDP_CLIENT_ID__}}"
content="${content//__GOOGLE_IDP_CLIENT_SECRET__/${GOOGLE_IDP_CLIENT_SECRET:-__GOOGLE_IDP_CLIENT_SECRET__}}"
printf '%s\n' "$content" > "${REALM_FILE}"

# ── 2. Start Keycloak in the background ──────────────────────────────────────
log "Starting Keycloak..."
/opt/keycloak/bin/kc.sh start &
KC_PID=$!

# Forward SIGTERM/SIGINT so Railway can shut the container down cleanly
trap 'log "Forwarding shutdown signal to Keycloak"; kill "$KC_PID" 2>/dev/null' SIGTERM SIGINT

# ── 3. Wait for Keycloak to be ready (management port, up to 3 min) ──────────
log "Waiting for Keycloak to be ready (up to 3 min)..."
ELAPSED=0
until curl -sf "${KC_MGMT_URL}/health/ready" > /dev/null 2>&1; do
  if [ "$ELAPSED" -ge 180 ]; then
    log "ERROR: Keycloak did not become ready within 3 minutes" >&2
    kill "$KC_PID"
    exit 1
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
log "Keycloak ready after ${ELAPSED}s"

# ── 4. Reconcile realm via keycloak-config-cli ───────────────────────────────
log "Reconciling realm config via keycloak-config-cli..."
java -jar /keycloak-config-cli.jar \
  --keycloak.url="${KC_MAIN_URL}" \
  --keycloak.user="${ADMIN_USER}" \
  --keycloak.password="${ADMIN_PASS}" \
  --import.files.locations="${REALM_FILE}" \
  --import.var-substitution.enabled=false \
  --import.remote-state.enabled=false
log "Realm reconciliation complete"

# ── 5. Stay alive until Keycloak exits ───────────────────────────────────────
log "Handing off to Keycloak (PID ${KC_PID})"
wait "$KC_PID"
