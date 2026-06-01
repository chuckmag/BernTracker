import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { api, type Gym, type Role } from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

const ROLE_LABEL: Record<Role, string> = {
  OWNER:      'Owner',
  PROGRAMMER: 'Programmer',
  COACH:      'Coach',
  MEMBER:     'Member',
}

// Lists the gyms the user is a member of, mirroring web's MyGymsSection
// on the /profile Memberships tab. The web version links to /gyms/new and
// references a browser gym-picker for the empty CTA; mobile has neither
// surface yet, so the empty state stays copy-only and points the user
// toward asking gym staff for an invite.
export default function MyGymsSection() {
  const { colors } = useTheme()
  const [gyms, setGyms] = useState<Gym[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.me.gyms()
      .then((list) => { if (!cancelled) setGyms(list) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load gyms') })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [])

  function roleColor(role: Role): string {
    switch (role) {
      case 'OWNER':
      case 'PROGRAMMER': return colors.primary
      case 'COACH':      return colors.successText
      case 'MEMBER':     return colors.textSecondary
    }
  }

  return (
    <View style={styles.section} testID="my-gyms-section">
      <ThemedText variant="label" style={styles.heading}>YOUR GYMS</ThemedText>

      {!hasLoaded && (
        <ActivityIndicator color={colors.primary} testID="my-gyms-loading" />
      )}

      {hasLoaded && error && (
        <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>
      )}

      {hasLoaded && !error && gyms.length === 0 && (
        <ThemedView variant="card" style={[styles.emptyCard, { borderColor: colors.borderSubtle }]}>
          <ThemedText style={styles.emptyTitle}>You're not a member of any gym yet</ThemedText>
          <ThemedText variant="tertiary" style={styles.emptyBody}>
            Ask gym staff to send you an invite, or get an invite link from a friend.
          </ThemedText>
        </ThemedView>
      )}

      {hasLoaded && !error && gyms.length > 0 && (
        <View style={styles.list}>
          {gyms.map((g) => (
            <ThemedView
              key={g.id}
              variant="card"
              style={[styles.row, { borderColor: colors.borderSubtle }]}
              testID={`my-gym-row-${g.id}`}
            >
              <ThemedText style={styles.gymName} numberOfLines={1}>{g.name}</ThemedText>
              <View style={[styles.badge, { backgroundColor: colors.surfaceSubtle }]}>
                <ThemedText style={[styles.badgeText, { color: roleColor(g.role) }]}>
                  {ROLE_LABEL[g.role]}
                </ThemedText>
              </View>
            </ThemedView>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { fontSize: 11, letterSpacing: 1 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gymName: { flex: 1, fontSize: 15, fontWeight: '500' },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyBody: { fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13 },
})
