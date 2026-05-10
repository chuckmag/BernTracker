# Keycloak Authorization Server

WODalytics uses Keycloak as its OAuth 2.1 authorization server, served at `qa.wodalytics.com/auth` via the web app's nginx reverse proxy.

## Railway setup (QA)

### 1. Create a Postgres database for Keycloak

In the Railway project, add a new Postgres service named `wodalytics-auth-db`. Keycloak needs its own database — do not reuse the application database.

### 2. Create the Keycloak service

In the Railway project, add a new service connected to this GitHub repo. Configure the service settings:

- **Root Directory:** `infra/keycloak`
- **Dockerfile Path:** `Dockerfile`

Setting Root Directory to `infra/keycloak` scopes the build context to that subdirectory, so the `COPY realm-wodalytics.json` in the Dockerfile resolves correctly. Railway builds the image using `infra/keycloak/Dockerfile`, which copies the realm JSON into the Keycloak image so it auto-imports on first boot.

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

Start command:

```
start --import-realm
```

### 3. Post-import steps (required — do these immediately after first boot)

All three clients (`wodalytics-web`, `wodalytics-mobile`, `wodalytics-mcp`) are **public clients with PKCE** — no client secrets to manage.

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

`docker compose up` starts a local Keycloak instance at `http://local.wodalytics.com/auth` with the realm pre-imported.

Admin console: `http://local.wodalytics.com/auth/admin` (admin / admin)

The `.env` file needs:
```
KEYCLOAK_ISSUER_URL=http://local.wodalytics.com/auth/realms/wodalytics
```

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

All three OAuth clients are public clients (PKCE, no secret) — there are no client secrets to manage or rotate.
