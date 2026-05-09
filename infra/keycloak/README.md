# Keycloak Authorization Server

WODalytics uses Keycloak as its OAuth 2.1 authorization server, served at `qa.wodalytics.com/auth` via the web app's nginx reverse proxy.

## Railway setup (QA)

### 1. Create a Postgres database for Keycloak

In the Railway project, add a new Postgres service named `wodalytics-auth-db`. Keycloak needs its own database — do not reuse the application database.

### 2. Create the Keycloak service

In the Railway project, add a new service from a Docker image:

```
Image: quay.io/keycloak/keycloak:26.2
```

Set the following environment variables in Railway:

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

Start command (import realm on first boot, then start):

```
start --import-realm
```

Mount `infra/keycloak/realm-wodalytics.json` as `/opt/keycloak/data/import/realm-wodalytics.json`.
On Railway this requires a volume mount or building a custom Docker image — see step 4.

### 3. Custom Docker image (recommended for realm import)

Because Railway doesn't support arbitrary volume mounts from the repo, build a thin image that embeds the realm JSON:

```dockerfile
FROM quay.io/keycloak/keycloak:26.2
COPY infra/keycloak/realm-wodalytics.json /opt/keycloak/data/import/realm-wodalytics.json
```

Create `infra/keycloak/Dockerfile` with the above content and point the Railway service at it.

### 4. Post-import secrets (required — do this immediately after first boot)

All three clients (`wodalytics-web`, `wodalytics-mobile`, `wodalytics-mcp`) are **public clients with PKCE** — no client secrets to manage. The only post-import secret to configure is the Google identity provider.

**Google identity provider:**
Identity Providers → google → Client ID / Client Secret. Set these to the values from the Google Cloud Console OAuth client registered for qa.wodalytics.com.

### 5. Nginx wiring

The web app's `nginx.conf.template` already contains the `/auth/` proxy block (added in this PR). Set these Railway env vars on the **web service** so nginx can resolve Keycloak:

```
KEYCLOAK_INTERNAL_HOST=<keycloak-railway-private-domain>
KEYCLOAK_INTERNAL_PORT=8080
```

### 6. API env var

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
