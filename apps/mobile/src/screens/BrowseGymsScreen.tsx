import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { api, type BrowseGym, type GymBrowseStatus } from '../lib/api'
import { useTheme } from '../lib/theme'
import { useAuth } from '../context/AuthContext'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'
import GymLogo from '../components/GymLogo'

// Mirror of apps/web/src/pages/BrowseGyms.tsx. Lets a member without an
// invitation token find a gym and send a join request — staff approve from
// the gym-settings inbox before they become a member.

const STATUS_LABEL: Record<GymBrowseStatus, string> = {
  NONE:            '',
  MEMBER:          'Member',
  REQUEST_PENDING: 'Request pending',
}

export default function BrowseGymsScreen() {
  const { colors } = useTheme()
  const { refreshUser } = useAuth()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [gyms, setGyms] = useState<BrowseGym[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    setError(null)
    api.gyms.browse(debounced)
      .then((list) => { if (!cancelled) setGyms(list) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load gyms')
      })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [debounced])

  async function handleRequest(gymId: string) {
    setActingOnId(gymId)
    setError(null)
    try {
      await api.gyms.joinRequest.create(gymId)
      setGyms((prev) => prev.map((g) => g.id === gymId ? { ...g, callerStatus: 'REQUEST_PENDING' } : g))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send request')
    } finally {
      setActingOnId(null)
    }
  }

  async function handleCancel(gymId: string) {
    setActingOnId(gymId)
    setError(null)
    try {
      await api.gyms.joinRequest.cancel(gymId)
      setGyms((prev) => prev.map((g) => g.id === gymId ? { ...g, callerStatus: 'NONE' } : g))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel request')
    } finally {
      setActingOnId(null)
    }
  }

  function renderItem({ item }: { item: BrowseGym }) {
    const acting = actingOnId === item.id
    return (
      <ThemedView
        variant="card"
        style={[styles.row, { borderColor: colors.borderSubtle }]}
        testID={`gym-row-${item.id}`}
      >
        <View style={styles.identity}>
          <GymLogo logoUrl={item.logoUrl} name={item.name} size="md" />
          <View style={styles.identityText}>
            <ThemedText style={styles.gymName} numberOfLines={1}>{item.name}</ThemedText>
            <ThemedText variant="tertiary" style={styles.gymMeta}>
              {item.memberCount} member{item.memberCount === 1 ? '' : 's'} · {item.timezone}
            </ThemedText>
          </View>
        </View>

        <View style={styles.actionSlot}>
          {item.callerStatus === 'NONE' && (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.primary }, acting && styles.disabled]}
              onPress={() => handleRequest(item.id)}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel={`Request to join ${item.name}`}
              testID={`gym-request-${item.id}`}
            >
              <ThemedText style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                {acting ? 'Sending…' : 'Request to join'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {item.callerStatus === 'REQUEST_PENDING' && (
            <View style={styles.pendingGroup}>
              <View style={[styles.pill, { backgroundColor: colors.warningBg }]}>
                <ThemedText style={[styles.pillText, { color: colors.warningText }]}>
                  {STATUS_LABEL.REQUEST_PENDING}
                </ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.borderInteractive }, acting && styles.disabled]}
                onPress={() => handleCancel(item.id)}
                disabled={acting}
                accessibilityRole="button"
                accessibilityLabel={`Cancel pending request for ${item.name}`}
                testID={`gym-cancel-${item.id}`}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                  {acting ? 'Cancelling…' : 'Cancel'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {item.callerStatus === 'MEMBER' && (
            <View style={[styles.pill, { backgroundColor: colors.successBg }]} testID={`gym-member-badge-${item.id}`}>
              <ThemedText style={[styles.pillText, { color: colors.successText }]}>
                {STATUS_LABEL.MEMBER}
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    )
  }

  function renderEmpty() {
    if (!hasLoaded) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )
    }
    return (
      <ThemedView variant="card" style={[styles.emptyCard, { borderColor: colors.borderSubtle }]}>
        <ThemedText style={styles.emptyTitle}>
          {debounced.trim() ? `No gyms match “${debounced.trim()}”` : 'No gyms found'}
        </ThemedText>
        <ThemedText variant="tertiary" style={styles.emptyBody}>
          {debounced.trim()
            ? 'Try a different name or clear the search.'
            : 'Ask your coach to add you, or check back once your gym joins WODalytics.'}
        </ThemedText>
      </ThemedView>
    )
  }

  // Refresh the AuthUser whenever a join action flips a row to MEMBER —
  // unblocks any caller (e.g. OnboardingScreen) that's waiting on the user
  // having a gym before progressing.
  useEffect(() => {
    if (gyms.some((g) => g.callerStatus === 'MEMBER')) {
      refreshUser().catch(() => {})
    }
  }, [gyms, refreshUser])

  return (
    <ThemedView variant="screen" style={styles.container}>
      {/* Header pinned above the scroll so the search box stays visible */}
      <View style={styles.stickyHeader}>
        <ThemedText style={styles.title}>Find a gym</ThemedText>
        <ThemedText variant="tertiary" style={styles.subtitle}>
          Search for your gym, send a request, and staff will approve you.
        </ThemedText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Gym name…"
          placeholderTextColor={colors.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.searchInput,
            { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
          ]}
          testID="gym-search-input"
        />
        {error && (
          <ThemedText style={[styles.errorText, { color: colors.errorText }]} testID="browse-gyms-error">
            {error}
          </ThemedText>
        )}
      </View>

      <FlatList
        data={gyms}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        testID="gym-list"
      />
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stickyHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    gap: 8,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    gap: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
  },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  gymName: {
    fontSize: 15,
    fontWeight: '600',
  },
  gymMeta: {
    fontSize: 12,
  },
  actionSlot: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  primaryButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pendingGroup: {
    alignItems: 'flex-end',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  center: {
    alignItems: 'center',
    paddingTop: 32,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyBody: {
    fontSize: 13,
  },
})
