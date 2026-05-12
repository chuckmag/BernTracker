#!/bin/bash
# Keycloak entrypoint with realm reconciliation via Admin REST API.
#
# On every boot:
#   1. Substitutes __GOOGLE_IDP_CLIENT_ID__ / __GOOGLE_IDP_CLIENT_SECRET__
#      in the realm template (same as the previous entrypoint.sh).
#   2. Starts Keycloak in the background and waits for it to be ready.
#   3. Acquires an admin token and reconciles realm-wodalytics.json:
#        - First boot (realm missing):  full realm import via POST /admin/realms
#        - Subsequent boots:            partial import (OVERWRITE) for clients,
#                                       roles, and identity providers
#      Users and active sessions are never touched.
#
# Resources covered by partialImport OVERWRITE:
#   clients (redirect URIs, scopes, etc.), roles, identityProviders
# Not covered (changes require a manual step — see README):
#   clientScopes, authentication flows
set -euo pipefail

REALM_TEMPLATE=/realm-template.json
REALM_FILE=/opt/keycloak/data/import/realm-wodalytics.json
REALM=wodalytics
KC_RELATIVE_PATH="${KC_HTTP_RELATIVE_PATH:-}"
KC_MAIN_URL="http://localhost:8080${KC_RELATIVE_PATH}"
KC_MGMT_URL="http://localhost:9000"

# Support both Keycloak 22+ env var names and the legacy names still in use
ADMIN_USER="${KC_BOOTSTRAP_ADMIN_USERNAME:-${KEYCLOAK_ADMIN:-admin}}"
ADMIN_PASS="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

log() { echo "[entrypoint] $*"; }

# ── 1. Substitute Google IDP credentials in realm template ───────────────────
log "Preparing realm JSON (substituting Google IDP credentials)..."
mkdir -p /opt/keycloak/data/import
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

# ── 4. Obtain admin token from master realm ───────────────────────────────────
log "Acquiring admin token..."
TOKEN=$(curl -sf \
  -X POST "${KC_MAIN_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "client_id=admin-cli" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PASS}" \
  | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  log "ERROR: Could not obtain admin token — check KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD" >&2
  kill "$KC_PID"
  exit 1
fi

# ── 5. Reconcile realm JSON ───────────────────────────────────────────────────
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${TOKEN}" \
  "${KC_MAIN_URL}/admin/realms/${REALM}")

if [ "$HTTP_STATUS" = "404" ]; then
  # First boot: import the full realm
  log "Realm '${REALM}' not found — running full import..."
  curl -sf \
    -X POST "${KC_MAIN_URL}/admin/realms" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @"${REALM_FILE}"
  log "Full realm import complete"

else
  # Subsequent boots: apply client/role/IDP changes without touching users
  log "Realm '${REALM}' exists — running partial import (OVERWRITE)..."
  jq '{
    ifResourceExists: "OVERWRITE",
    clients:           (.clients           // []),
    roles:             (.roles             // {}),
    identityProviders: (.identityProviders // [])
  }' "${REALM_FILE}" \
  | curl -sf \
      -X POST "${KC_MAIN_URL}/admin/realms/${REALM}/partialImport" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d @-
  log "Partial import complete"
fi

log "Realm reconciliation done — handing off to Keycloak (PID ${KC_PID})"

# ── 6. Stay alive until Keycloak exits ───────────────────────────────────────
wait "$KC_PID"
