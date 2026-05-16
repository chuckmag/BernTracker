/**
 * One-time idempotent migration: copy all WODalytics users into Keycloak.
 *
 * For each user:
 *   - Creates a Keycloak user with wodalytics_user_id + wodalytics_role attributes
 *   - Imports bcrypt password hash if present (users keep their existing password)
 *   - Links Google federated identity if present
 *
 * If a Keycloak user with the same email already exists, attributes are updated.
 * Credentials are set only when absent — use --force-credentials to overwrite.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/migrate-users-to-keycloak.ts [--dry-run] [--force-credentials]
 *
 * Flags:
 *   --dry-run            print intended actions without writing to Keycloak
 *   --force-credentials  overwrite password credentials even when already set
 *                        (use after adding the bcrypt provider JAR to recover from
 *                        a migration run that stored hashes before the provider
 *                        was installed — those credentials are unverifiable)
 *
 * Env vars:
 *   KEYCLOAK_ADMIN_URL      e.g. https://qa.wodalytics.com/auth  (no trailing slash)
 *   KEYCLOAK_ADMIN          admin username (default: "admin")
 *   KEYCLOAK_ADMIN_PASSWORD admin password
 *   DATABASE_URL            postgres connection string (read via Prisma)
 *
 * Prerequisite: infra/keycloak must be deployed with the bcrypt provider JAR
 * (extension-password-hashprovider in /opt/keycloak/providers/). Without it
 * Keycloak stores the hash but cannot verify it at login time.
 */

import { PrismaClient } from '@wodalytics/db'

const REALM = 'wodalytics'
const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_CREDENTIALS = process.argv.includes('--force-credentials')

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

// ─── Credential helpers (existing users) ─────────────────────────────────────

async function hasPasswordCredential(keycloakId: string, token: string): Promise<boolean> {
  const resp = await fetch(`${BASE}/users/${keycloakId}/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Credentials lookup failed (${resp.status})`)
  const creds = (await resp.json()) as { type: string }[]
  return creds.some((c) => c.type === 'password')
}

async function setRawCredential(keycloakId: string, hash: string, token: string): Promise<void> {
  const resp = await fetch(`${BASE}/users/${keycloakId}/reset-password`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'password',
      temporary: false,
      secretData: JSON.stringify({ value: hash, salt: '', additionalParameters: {} }),
      credentialData: JSON.stringify({
        hashIterations: 10,
        algorithm: 'bcrypt',
        additionalParameters: {},
      }),
    }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Set credential failed (${resp.status}): ${body}`)
  }
}

// ─── bcrypt credential representation ────────────────────────────────────────
// Full bcrypt hash string goes in secretData.value; salt is embedded in the
// hash itself so secretData.salt is empty. hashIterations=10 matches the cost
// factor used by the API (bcrypt.hash(password, 10)). Verification requires
// the extension-password-hashprovider JAR in /opt/keycloak/providers/ —
// Keycloak 26 ships PBKDF2-only and cannot verify algorithm=bcrypt without it.

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
  if (FORCE_CREDENTIALS && !DRY_RUN) {
    console.log('[force-credentials] Will overwrite existing password credentials\n')
  }

  const users = await prisma.user.findMany({
    include: { oauthAccounts: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${users.length} users in WODalytics DB`)
  if (DRY_RUN) console.log()

  const token = DRY_RUN ? 'dry-run' : await getAdminToken()

  let migrated = 0
  let updated = 0
  let credentialsSet = 0
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
        await updateKeycloakUserAttributes(
          existingId,
          {
            wodalytics_user_id: [user.id],
            wodalytics_role: [user.role],
          },
          token,
        )

        // Set the bcrypt credential when it's absent, or always when --force-credentials
        // is passed. The force flag exists to recover from a migration run that stored
        // hashes before the bcrypt provider JAR was deployed — those stored credentials
        // are unverifiable and need to be written again once the provider is present.
        if (user.passwordHash) {
          const needsCredential =
            FORCE_CREDENTIALS || !(await hasPasswordCredential(existingId, token))
          if (needsCredential) {
            await setRawCredential(existingId, user.passwordHash, token)
            console.log(`[updated]  ${user.email} (credential set)`)
            credentialsSet++
          } else {
            console.log(`[updated]  ${user.email}`)
          }
        } else {
          console.log(`[updated]  ${user.email}`)
        }

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
  console.log(
    `Done. migrated=${migrated} updated=${updated} credentials-set=${credentialsSet} skipped=${skipped} errors=${errors}`,
  )

  if (errors > 0) process.exit(1)
}

main()
  .catch((err) => {
    console.error('Fatal:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
