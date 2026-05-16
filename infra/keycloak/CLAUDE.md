# infra/keycloak — CLAUDE.md

Guidance specific to the Keycloak authorization server. Cross-cutting setup (Railway service config, nginx wiring, realm-as-code workflow) lives in `README.md` — read that first if you're doing initial QA setup.

## Federating existing WODalytics users into Keycloak

Use `scripts/migrate-users-to-keycloak.ts` (introduced in PR #337) to copy all WODalytics users from Postgres into Keycloak. The script is idempotent: it creates new users, and for users already present in Keycloak it updates attributes and sets any missing password credentials.

### Prerequisites

1. Keycloak is up and the realm is imported (see `README.md` → *Railway setup*).
2. **Keycloak deployed with the bcrypt provider JAR** — the `Dockerfile` downloads `extension-password-hashprovider` into `/opt/keycloak/providers/`. Without this JAR, Keycloak 26 stores imported bcrypt hashes but has no provider to verify them at login time. The credential will be present in the DB but every password login will fail.
3. `unmanagedAttributePolicy=ENABLED` is set on the realm — otherwise custom attributes (`wodalytics_user_id`, `wodalytics_role`) are silently dropped. See `README.md` → *Post-import steps*.
4. Google IDP is configured in Keycloak — required for federated identity links to resolve correctly.

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

The script prints `[migrated]`, `[updated]`, or `[error]` per user and a summary `migrated= updated= credentials-set= errors=` line at the end. Exit code 1 if any user errored.

#### Getting the public URL

```bash
railway variable list --service WODalytics-DB --environment qa | grep DATABASE_PUBLIC_URL
```

### Recovering from a migration run before the bcrypt provider was deployed

If the script was run before the Keycloak image was rebuilt with the bcrypt JAR, users with passwords will have an unverifiable credential stored in Keycloak. After rebuilding and redeploying Keycloak with the new Dockerfile, overwrite those credentials with:

```bash
DATABASE_URL="<DATABASE_PUBLIC_URL>" \
KEYCLOAK_ADMIN_URL=https://qa.wodalytics.com/auth \
KEYCLOAK_ADMIN=admin \
KEYCLOAK_ADMIN_PASSWORD=<KEYCLOAK_ADMIN_PASSWORD> \
npx tsx scripts/migrate-users-to-keycloak.ts --force-credentials
```

`--force-credentials` overwrites the stored credential for every user who has a `passwordHash` in Postgres, regardless of whether Keycloak already has one. Safe to run alongside a normal (no-flag) re-run.

### What the script does per user

- Sets `username=email`, `emailVerified=true`, `firstName`, `lastName`, `enabled=true`
- Sets `attributes.wodalytics_user_id` and `attributes.wodalytics_role` (protocol mappers → JWT claims)
- Imports bcrypt `passwordHash` if present (`algorithm=bcrypt`, `hashIterations=10` matching the app's cost factor)
- Links Google federated identity if an `OAuthAccount(provider=google)` row exists

For users already in Keycloak (`[updated]`): attributes are always refreshed; password credential is set only when absent (or always with `--force-credentials`); federated identities are left untouched.

### Re-running (idempotency)

Safe to re-run at any time. Users already in Keycloak get `[updated]`. No duplicates are created. Existing password credentials are not overwritten unless `--force-credentials` is passed.
