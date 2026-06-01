import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native'
import { api, type PendingInvitation, type Role } from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

const ROLE_LABEL: Record<Role, string> = {
  OWNER:      'Owner',
  PROGRAMMER: 'Programmer',
  COACH:      'Coach',
  MEMBER:     'Member',
}

function formatInviter(
  invitedBy: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string } | null,
): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last  = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (invitedBy.name?.trim()) return invitedBy.name.trim()
  return invitedBy.email ?? 'a staff member'
}

function invitationKey(item: PendingInvitation): string {
  return item.kind === 'membershipRequest' ? item.data.id : `code-${item.data.code}`
}

interface Props {
  // Notify the parent when invitations transition between zero and non-zero.
  // OnboardingScreen uses this to decide whether to show the invitations step
  // at all. Defaults to a no-op when the consumer doesn't care (Settings tab).
  onChange?: (count: number) => void
}

// Pending invitations a user has yet to accept or decline. Merges:
//   - Invitation (pre-signup, identified by `code`) — email/SMS invite link.
//   - GymMembershipRequest (post-signup, identified by `id`) — staff inviting
//     someone who already has an account.
// Server returns both in one feed via GET /api/users/me/pending-invitations.
// Renders nothing when the feed is empty so the parent doesn't show a stale
// "no invitations" placeholder — mirrors web MyInvitationsSection.
export default function MyInvitationsSection({ onChange }: Props = {}) {
  const { colors } = useTheme()
  const [items, setItems] = useState<PendingInvitation[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.users.me.invitations.pendingAll()
      .then((list) => {
        if (cancelled) return
        setItems(list)
        onChange?.(list.length)
      })
      .catch(() => {
        // Onboarding step 2 swallows failures here too — without a list we
        // simply render nothing and the user proceeds without invites.
      })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  // onChange may be a fresh function on every render of the parent; capturing
  // it once on mount matches the behavior we want (notify after initial load
  // and after each subsequent action), without retriggering the fetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handle(action: 'accept' | 'decline', item: PendingInvitation) {
    const key = invitationKey(item)
    setActingOn(key)
    setError(null)
    try {
      if (action === 'accept') {
        if (item.kind === 'membershipRequest') {
          await api.users.me.invitations.accept(item.data.id)
        } else {
          await api.users.me.codeInvitations.accept(item.data.code)
        }
      } else {
        if (item.kind === 'membershipRequest') {
          await api.users.me.invitations.decline(item.data.id)
        } else {
          await api.users.me.codeInvitations.decline(item.data.code)
        }
      }
      setItems((prev) => {
        const next = prev.filter((i) => invitationKey(i) !== key)
        onChange?.(next.length)
        return next
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action} invitation`)
    } finally {
      setActingOn(null)
    }
  }

  // Pre-load: nothing yet to show. Once loaded with zero items, render nothing
  // so the parent layout collapses cleanly — same contract as web.
  if (!hasLoaded) {
    return (
      <View style={styles.section} testID="my-invitations-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (items.length === 0) return null

  return (
    <View style={styles.section} testID="my-invitations-section">
      <ThemedText variant="label" style={styles.heading}>INVITATIONS</ThemedText>
      <View style={styles.list}>
        {items.map((item) => {
          const key = invitationKey(item)
          const gymName =
            item.kind === 'membershipRequest' ? item.data.gym.name : item.data.gym?.name ?? null
          const role = item.data.roleToGrant
          const inviter = formatInviter(item.data.invitedBy)
          const acting = actingOn === key
          return (
            <ThemedView
              key={key}
              variant="card"
              style={[styles.card, { borderColor: colors.borderSubtle }]}
              testID={`my-invitation-${key}`}
            >
              <View style={styles.cardHeader}>
                {gymName
                  ? (
                    <ThemedText style={styles.title}>
                      <ThemedText style={styles.titleStrong}>{gymName}</ThemedText>
                      <ThemedText variant="tertiary"> invited you as </ThemedText>
                      <ThemedText style={[styles.titleStrong, { color: colors.primary }]}>{ROLE_LABEL[role]}</ThemedText>
                    </ThemedText>
                  )
                  : (
                    <ThemedText style={styles.titleStrong}>WODalytics invitation</ThemedText>
                  )
                }
                <ThemedText variant="tertiary" style={styles.meta}>
                  {`From ${inviter} · ${new Date(item.data.createdAt).toLocaleDateString()}`}
                </ThemedText>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => handle('accept', item)}
                  disabled={acting}
                  style={[styles.acceptBtn, { backgroundColor: colors.primary }, acting && styles.btnDisabled]}
                  testID={`accept-invitation-${key}`}
                >
                  <ThemedText style={[styles.acceptText, { color: colors.onPrimary }]}>
                    {acting ? 'Accepting…' : 'Accept'}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handle('decline', item)}
                  disabled={acting}
                  style={[styles.declineBtn, { borderColor: colors.borderInteractive }, acting && styles.btnDisabled]}
                  testID={`decline-invitation-${key}`}
                >
                  <ThemedText variant="secondary" style={styles.declineText}>Decline</ThemedText>
                </TouchableOpacity>
              </View>
            </ThemedView>
          )
        })}
      </View>
      {error && (
        <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { fontSize: 11, letterSpacing: 1 },
  list: { gap: 8 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  cardHeader: { gap: 4 },
  title: { fontSize: 14 },
  titleStrong: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptText: { fontSize: 14, fontWeight: '600' },
  declineBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineText: { fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  error: { fontSize: 13 },
})
