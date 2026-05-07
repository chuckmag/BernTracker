import { useCallback, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api, type ConsistencyData, type TrackedMovement } from '../lib/api'
import ConsistencyCard from '../components/ConsistencyCard'
import StrengthPRCard from '../components/StrengthPRCard'

export default function AnalyticsScreen() {
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null)
  const [movements, setMovements] = useState<TrackedMovement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setError(null)
    try {
      const [c, m] = await Promise.all([
        api.analytics.consistency(12),
        api.analytics.trackedMovements(),
      ])
      setConsistency(c)
      setMovements(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchData().finally(() => setLoading(false))
    }, []),
  )

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#818cf8" />}
    >
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color="#818cf8" />
        </View>
      )}

      {!loading && error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {!loading && !error && (
        <>
          {movements && movements.length > 0 && <StrengthPRCard movements={movements} />}
          {consistency && <ConsistencyCard data={consistency} weeks={12} />}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  error: {
    color: '#f87171',
    fontSize: 14,
  },
})
