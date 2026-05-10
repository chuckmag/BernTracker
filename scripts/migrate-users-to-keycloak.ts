/**
 * One-time idempotent migration: copy all WODalytics users into Keycloak.
 *
 * For each user:
 *   - Creates a Keycloak user with wodalytics_user_id + wodalytics_role attributes
 *   - Imports bcrypt password hash if present (users keep their existing password)
 *   - Links Google federated identity if present
 *
 * If a Keycloak user with the same email already exists, attributes are updated
 * but credentials and federated identities are left untouched. Safe to re-run.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/migrate-users-to-keycloak.ts [--dry-run]
 *
 * Env vars:
 *   KEYCLOAK_ADMIN_URL      e.g. https://qa.wodalytics.com/auth  (no trailing slash)
 *   KEYCLOAK_ADMIN          admin username (default: "admin")
 *   KEYCLOAK_ADMIN_PASSWORD admin password
 *   DATABASE_URL            postgres connection string (read via Prisma)
 */

import { PrismaClient } from '@wodalytics/db'

const REALM = 'wodalytics'
const DRY_RUN = process.argv.includes('--dry-run')

const KEYCLOAK_ADMIN_URL = process.env.KEYCLOAK_ADMIN_URL?.replace(/\/$/, '')
const KEYCLOAK_ADMIN = process.env.KEYCLOAK_ADMIN ?? 'admin'
const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD

if (!KEYCLOAK_ADMIN_URL) {
  console.error('ERROR: KEYCLOAK_ADMIN_URL is required')
  process.exit(1)
}
if (!KEYCLOAK_ADMIN_PASSWORD) {
  console.error('ERROR: KEYCLOAK_ADMIN_PASSWORD is required')
  process.exit(1)
}

const prisma = new PrismaClient()

// ─── Keycloak admin token ─────────────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const resp = await fetch(`${KEYCLOAK_ADMIN_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: KEYCLOAK_ADMIN,
      password: KEYCLOAK_ADMIN_PASSWORD!,
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Failed to obtain admin token (${resp.status}): ${body}`)
  }
  const data = (await resp.json()) as { access_token: string }
  return data.access_token
}

// ─── Keycloak user lookup / create / update ───────────────────────────────────

const BASE = `${KEYCLOAK_ADMIN_URL}/admin/realms/${REALM}`

async function findKeycloakUserByEmail(email: string, token: string): Promise<string | null> {
  const resp = await fetch(`${BASE}/users?email=${encodeURIComponent(email)}&exact=true`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`User lookup failed (${resp.status})`)
  const users = (await resp.json()) as { id: string; email: string }[]
  return users.find((u) => u.email === email)?.id ?? null
}

async function createKeycloakUser(payload: object, token: string): Promise<string> {
  const resp = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Create user failed (${resp.status}): ${body}`)
  }
  const location = resp.headers.get('Location') ?? ''
  const id = location.split('/').pop()
  if (!id) throw new Error('Create user response missing Location header')
  return id
}

async function updateKeycloakUserAttributes(
  keycloakId: string,
  attributes: Record<string, string[]>,
  token: string,
): Promise<void> {
  const resp = await fetch(`${BASE}/users/${keycloakId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Update user failed (${resp.status}): ${body}`)
  }
}

// ─── bcrypt credential representation ────────────────────────────────────────
// Keycloak's bcrypt provider reads the full bcrypt hash string from
// secretData.value. The salt is embedded in the hash string itself.
//
// Note: Keycloak 26 defaults to Argon2 for new passwords. Imported bcrypt
// credentials are stored with algorithm="bcrypt" and should be verified by
// Keycloak's bcrypt provider on first login, then auto-rehashed to Argon2.
// In practice, QA users authenticate via Google IDP — the bcrypt path is
// kept for completeness but has not been exercised against Keycloak 26.

function bcryptCredential(hash: string) {
  return {
    type: 'password',
    secretData: JSON.stringify({ value: hash, salt: '', additionalParameters: {} }),
    credentialData: JSON.stringify({
      hashIterations: 10,
      algorithm: 'bcrypt',
      additionalParameters: {},
    }),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('[dry-run] No writes will be made to Keycloak\n')

  const users = await prisma.user.findMany({
    include: { oauthAccounts: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${users.length} users in WODalytics DB`)
  if (DRY_RUN) console.log()

  const token = DRY_RUN ? 'dry-run' : await getAdminToken()

  let migrated = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  for (const user of users) {
    const googleAccount = user.oauthAccounts.find((a) => a.provider === 'google')

    try {
      if (DRY_RUN) {
        const actions: string[] = []
        if (user.passwordHash) actions.push('import bcrypt hash')
        if (googleAccount) actions.push('link Google identity')
        console.log(`[dry-run] ${user.email} — would migrate (${actions.join(', ') || 'no credentials'})`)
        migrated++
        continue
      }

      const existingId = await findKeycloakUserByEmail(user.email, token)

      if (existingId) {
        // User already in Keycloak — update attributes only, leave credentials alone
        await updateKeycloakUserAttributes(
          existingId,
          {
            wodalytics_user_id: [user.id],
            wodalytics_role: [user.role],
          },
          token,
        )
        console.log(`[updated]  ${user.email}`)
        updated++
        continue
      }

      const payload: Record<string, unknown> = {
        username: user.email,
        email: user.email,
        emailVerified: true,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        enabled: true,
        attributes: {
          wodalytics_user_id: [user.id],
          wodalytics_role: [user.role],
        },
        credentials: user.passwordHash ? [bcryptCredential(user.passwordHash)] : [],
        federatedIdentities: googleAccount
          ? [
              {
                identityProvider: 'google',
                userId: googleAccount.providerId,
                userName: user.email,
              },
            ]
          : [],
      }

      await createKeycloakUser(payload, token)
      console.log(`[migrated] ${user.email}`)
      migrated++
    } catch (err) {
      console.error(`[error]    ${user.email} — ${err instanceof Error ? err.message : err}`)
      errors++
    }
  }

  console.log()
  console.log(`Done. migrated=${migrated} updated=${updated} skipped=${skipped} errors=${errors}`)

  if (errors > 0) process.exit(1)
}

main()
  .catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
