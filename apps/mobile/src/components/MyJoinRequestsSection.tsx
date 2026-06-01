import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native'
import { api, type GymJoinRequest } from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

// Outgoing USER_REQUESTED join requests the caller has open. Renders nothing
// when empty — gym membership is the common state, outgoing requests are
// rare. Mirrors web's MyJoinRequestsSection on /profile Memberships tab.
export default function MyJoinRequestsSection() {
  const { colors } = useTheme()
  const [requests, setRequests] = useState<GymJoinRequest[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.users.me.joinRequests.list()
      .then((list) => { if (!cancelled) setRequests(list) })
      .catch(() => {
        // Same swallow pattern as web — a join-requests fetch failure
        // shouldn't break the rest of the Memberships tab.
      })
      .finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [])

  async function handleCancel(req: GymJoinRequest) {
    setActingOnId(req.id)
    setError(null)
    try {
      await api.gyms.joinRequest.cancel(req.gymId)
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel request')
    } finally {
      setActingOnId(null)
    }
  }

  if (!hasLoaded) {
    return (
      <View style={styles.section} testID="my-join-requests-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (requests.length === 0) return null

  return (
    <View style={styles.section} testID="my-join-requests-section">
      <ThemedText variant="label" style={styles.heading}>OUTGOING REQUESTS</ThemedText>
      <View style={styles.list}>
        {requests.map((r) => {
          const acting = actingOnId === r.id
          return (
            <ThemedView
              key={r.id}
              variant="card"
              style={[styles.card, { borderColor: colors.borderSubtle }]}
              testID={`my-join-request-${r.id}`}
            >
              <View style={styles.cardHeader}>
                <ThemedText style={styles.title}>
                  <ThemedText variant="secondary">Pending request to join </ThemedText>
                  <ThemedText style={styles.titleStrong}>{r.gym.name}</ThemedText>
                </ThemedText>
                <ThemedText variant="tertiary" style={styles.meta}>
                  {`Sent ${new Date(r.createdAt).toLocaleDateString()}`}
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => handleCancel(r)}
                disabled={acting}
                style={[styles.cancelBtn, { borderColor: colors.borderInteractive }, acting && styles.btnDisabled]}
                testID={`cancel-join-request-${r.id}`}
              >
                <ThemedText variant="secondary" style={styles.cancelText}>
                  {acting ? 'Cancelling…' : 'Cancel request'}
                </ThemedText>
              </TouchableOpacity>
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
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.6 },
  error: { fontSize: 13 },
})
