# infra/keycloak — CLAUDE.md

Guidance specific to the Keycloak authorization server. Cross-cutting setup (Railway service config, nginx wiring, realm-as-code workflow) lives in `README.md` — read that first if you're doing initial QA setup.

## Federating existing WODalytics users into Keycloak

Use `scripts/migrate-users-to-keycloak.ts` (introduced in PR #337) to copy all WODalytics users from Postgres into Keycloak. The script is idempotent: it creates new users, and for users already present in Keycloak it updates attributes only (leaves credentials and federated identities untouched).

### Prerequisites

1. Keycloak is up and the realm is imported (see `README.md` → *Railway setup*).
2. `unmanagedAttributePolicy=ENABLED` is set on the realm — otherwise custom attributes (`wodalytics_user_id`, `wodalytics_role`) are silently dropped. See `README.md` → *Post-import steps*.
3. Google IDP is configured in Keycloak — required for federated identity links to resolve correctly.

### Running locally against QA

The script reads `DATABASE_URL` from the environment. Railway Postgres exposes **two** connection strings:

| Variable | Hostname | Reachable from |
|---|---|---|
| `DATABASE_URL` | `postgres.railway.internal` | Inside Railway only |
| `DATABASE_PUBLIC_URL` | `*.proxy.rlwy.net` | Anywhere |

**Running with `DATABASE_URL` from `.env` will hang** — `.railway.internal` is unreachable from your Mac. Always override `DATABASE_URL` with the public proxy URL when running from outside Railway.

#### Dry run (always do this first)

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL from WODalytics-DB QA service>" \
KEYCLOAK_ADMIN_URL=https://qa.wodalytics.com/auth \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=<KEYCLOAK_ADMIN_PASSWORD> \
npx tsx scripts/migrate-users-to-keycloak.ts --dry-run
```

The dry-run queries Postgres and prints what it _would_ do for each user — no writes to Keycloak. Verify the output (user count, `link Google identity` / `import bcrypt hash` labels) before proceeding.

#### Full run

Same command, drop `--dry-run`:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL from WODalytics-DB QA service>" \
KEYCLOAK_ADMIN_URL=https://qa.wodalytics.com/auth \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=<KEYCLOAK_ADMIN_PASSWORD> \
npx tsx scripts/migrate-users-to-keycloak.ts
```

The script prints `[migrated]`, `[updated]`, or `[error]` per user, then a summary line. Exit code 1 if any user errored.

#### Getting the public URL

```bash
railway variable list --service WODalytics-DB --environment qa | grep DATABASE_PUBLIC_URL
```

### What the script does per user

- Sets `username=email`, `emailVerified=true`, `firstName`, `lastName`, `enabled=true`
- Sets `attributes.wodalytics_user_id` and `attributes.wodalytics_role` (protocol mappers → JWT claims)
- Imports bcrypt `passwordHash` if present (stored with `algorithm=bcrypt`; Keycloak 26 rehashes to Argon2 on first successful login)
- Links Google federated identity if an `OAuthAccount(provider=google)` row exists

**Known limitation:** bcrypt credential import has not been validated against Keycloak 26 in QA. QA users authenticate via Google IDP — the bcrypt path exists for completeness. Password users can use "Forgot Password" to set a Keycloak-native credential if needed.

### Re-running (idempotency)

Safe to re-run at any time. Users already in Keycloak get `[updated]` — attributes refreshed, credentials and federated identities left alone. No duplicates are created.
