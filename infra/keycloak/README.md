# Keycloak Authorization Server

WODalytics uses Keycloak as its OAuth 2.1 authorization server, served at `qa.wodalytics.com/auth` via the web app's nginx reverse proxy.

## Railway setup (QA)

### 1. Create a Postgres database for Keycloak

In the Railway project, add a new Postgres service named `wodalytics-auth-db`. Keycloak needs its own database — do not reuse the application database.

### 2. Create the Keycloak service

In the Railway project, add a new service connected to this GitHub repo. Configure the service settings:

- **Root Directory:** `infra/keycloak`
- **Dockerfile Path:** `Dockerfile`

Setting Root Directory to `infra/keycloak` scopes the build context to that subdirectory, so the `COPY realm-wodalytics.json` in the Dockerfile resolves correctly. The Dockerfile's `CMD ["start", "--import-realm"]` handles the start command — leave the Railway start command field empty.

Set the following environment variables on the service in Railway:

```
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<strong-secret>
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://<auth-db-private-host>/<db-name>
KC_DB_USERNAME=<db-user>
KC_DB_PASSWORD=<db-password>
KC_HOSTNAME=https://qa.wodalytics.com
KC_HTTP_RELATIVE_PATH=/auth
KC_HTTP_ENABLED=true
KC_PROXY=edge
KC_FEATURES=token-exchange
```

### 3. Post-import steps (required — do these immediately after first boot)

All three clients (`wodalytics-web`, `wodalytics-mobile`, `wodalytics-mcp`) are **public clients with PKCE** — no client secrets to manage.

**Realm files — two variants:**

`realm-wodalytics.json` is the QA/prod source of truth. It only registers specific redirect URIs and origins (`qa.wodalytics.com`, `local.wodalytics.com`, `localhost:5173`). Do not add localhost wildcards here.

`realm-wodalytics-dev.json` is generated from the prod file with `*` appended to the `wodalytics-web` client's redirect URIs and web origins. This is what `docker-compose.yml` imports locally, so any random `dev:worktree` port is accepted. Keycloak does not support port wildcards so a bare `*` is the only option for local dev.

When making realm changes: edit `realm-wodalytics.json`, then regenerate the dev variant:
```bash
cd infra/keycloak
jq '
  (.clients[] | select(.clientId == "wodalytics-web") | .redirectUris) += ["*"] |
  (.clients[] | select(.clientId == "wodalytics-web") | .webOrigins) += ["*"] |
  del(.smtpServer)
' realm-wodalytics.json > realm-wodalytics-dev.json
```
`del(.smtpServer)` keeps the local Keycloak from attempting to reach Google's
SMTP relay (no app password is provisioned locally; the dev import would fail
the configuration test).

**User Profile — unmanaged attribute policy (required for custom user attributes):**

Keycloak 26's User Profile silently drops any custom user attribute (`wodalytics_user_id`, `wodalytics_role`) that isn't declared in the realm's UP schema. The realm JSON sets the attribute schema correctly but Keycloak's import path does not apply the `unmanagedAttributePolicy` setting. Set it once via the admin REST API after first boot:

```bash
# Get an admin token
ADMIN_TOKEN=$(curl -sf -X POST https://qa.wodalytics.com/auth/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=<KEYCLOAK_ADMIN_PASSWORD>" \
  | jq -r .access_token)

# Enable unmanaged (custom) attributes
curl -sf -X PUT \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://qa.wodalytics.com/auth/admin/realms/wodalytics/users/profile \
  -d "$(curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
    https://qa.wodalytics.com/auth/admin/realms/wodalytics/users/profile \
    | jq '.unmanagedAttributePolicy = "ENABLED"')"
```

Or set it in the admin console: Realm Settings → User Profile → Unmanaged attributes → **Allow**.

**Google identity provider:**
Identity Providers → google → Client ID / Client Secret. Set these to the values from the Google Cloud Console OAuth client registered for qa.wodalytics.com.

Also add the Keycloak broker callback to the Google Cloud Console's **Authorized redirect URIs** for that client:
```
https://qa.wodalytics.com/auth/realms/wodalytics/broker/google/endpoint
```
(The Google OAuth flow goes: SPA → Keycloak → Google → back to Keycloak at this URI → back to SPA. Google must know about the Keycloak leg.)

### 4. Nginx wiring

The web app's `nginx.conf.template` already contains the `/auth/` proxy block (added in this PR). Set these Railway env vars on the **web service** so nginx can resolve Keycloak:

```
KEYCLOAK_INTERNAL_HOST=<keycloak-railway-private-domain>
KEYCLOAK_INTERNAL_PORT=8080
```

### 5. API env var

Set on the **api service** in Railway:

```
KEYCLOAK_ISSUER_URL=https://qa.wodalytics.com/auth/realms/wodalytics
```

## Local development

`docker compose up` (from this directory) starts a local Keycloak instance at `http://localhost:8180/auth` using an embedded H2 database — no separate Postgres required.

Admin console: `http://localhost:8180/auth/admin` (admin / admin)

The `.env` file needs (already present if you copied `.env.example`):
```
KEYCLOAK_ISSUER_URL=http://localhost:8180/auth/realms/wodalytics
VITE_KEYCLOAK_URL=http://localhost:8180/auth
```

`KEYCLOAK_ISSUER_URL` tells the API where to fetch JWKS and how to validate the `iss` claim.
`VITE_KEYCLOAK_URL` points the web SPA directly at the local Keycloak container — it bypasses the nginx `/auth` proxy that QA uses, since there is no nginx in the `npm run dev:worktree` workflow.

**Note:** Google sign-in does not work in local dev — the Google IDP credentials are only set on the QA instance. Use email/password login for local testing (create a user in the Keycloak admin console under the `wodalytics` realm → Users → Add user).

## Realm-as-code

`realm-wodalytics.json` is the source of truth for realm configuration. **Do not make configuration changes only in the Keycloak admin UI** — export the realm after any change and commit the updated JSON.

To export the current realm state:
```bash
# From the Keycloak container
/opt/keycloak/bin/kc.sh export --realm wodalytics --dir /tmp/export
```

Or via the admin REST API:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://qa.wodalytics.com/auth/admin/realms/wodalytics \
  > infra/keycloak/realm-wodalytics.json
```

## Secrets that are NOT committed

- Google IDP `clientId` / `clientSecret` — set via Keycloak admin after import
- `KEYCLOAK_ADMIN_PASSWORD` — Railway env var only
- `KC_DB_PASSWORD` — Railway env var only
- `SMTP_PASSWORD` — Google Workspace app password for `no-reply@wodalytics.com`, Railway env var only. The realm JSON carries the `__SMTP_PASSWORD__` placeholder; `docker-entrypoint.sh` substitutes the value at boot, and strips the `smtpServer` block entirely when the var is unset so the placeholder is never pushed to Keycloak.

All three OAuth clients are public clients (PKCE, no secret) — there are no client secrets to manage or rotate.

## SMTP / outbound email

The realm is configured to send transactional email (password reset, verify
email, etc.) from `no-reply@wodalytics.com` via Google Workspace's SMTP relay
service. The configuration lives in `realm-wodalytics.json` under `smtpServer`:

| Field | Value |
|---|---|
| host | `smtp-relay.gmail.com` |
| port | `587` (STARTTLS) |
| from | `no-reply@wodalytics.com` |
| user | `no-reply@wodalytics.com` |
| password | `__SMTP_PASSWORD__` (substituted at boot from Railway env var) |

**To enable email sending on a Railway environment:**

```bash
railway variables --set SMTP_PASSWORD=<google-workspace-app-password> \
  --project c218e9bc-d755-43de-a2b8-1f3e21b6c7e5 \
  --environment qa \
  --service bfe642c5-1cd9-4369-853b-c01e50ec6d4a
```

Redeploy WODalytics-Auth. The entrypoint substitutes the placeholder and the
realm is reconciled with working SMTP. Without the env var the realm imports
with no `smtpServer` block and password-reset emails do not send (Keycloak
surfaces an error instead of bouncing into spam).

Local dev (`docker compose up`) imports `realm-wodalytics-dev.json`, which has
`smtpServer` stripped at regeneration time — no SMTP password is needed
locally and password-reset flows will not deliver email in dev.
