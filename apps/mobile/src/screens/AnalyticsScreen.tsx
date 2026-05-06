import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { api, type ConsistencyData } from '../lib/api'
import ConsistencyCard from '../components/ConsistencyCard'

export default function AnalyticsScreen() {
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchData() {
    setError(null)
    try {
      const data = await api.analytics.consistency(12)
      setConsistency(data)
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
      <Text style={styles.heading}>Analytics</Text>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color="#818cf8" />
        </View>
      )}

      {!loading && error && (
        <Text style={styles.error}>{error}</Text>
      )}

      {!loading && !error && consistency && (
        <ConsistencyCard data={consistency} weeks={12} />
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
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
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
