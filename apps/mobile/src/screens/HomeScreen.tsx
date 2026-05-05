import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { api, type DashboardToday } from '../lib/api'
import { useGym } from '../context/GymContext'
import { useAuth } from '../context/AuthContext'
import WodHeroCard from '../components/WodHeroCard'
import LeaderboardCard from '../components/LeaderboardCard'
import UpcomingCard from '../components/UpcomingCard'

function greetingFor(firstName: string | null | undefined): string {
  const hour = new Date().getHours()
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return firstName ? `Good ${period}, ${firstName}` : `Good ${period}`
}

export default function HomeScreen() {
  const { activeGym } = useGym()
  const { user } = useAuth()
  const [data, setData] = useState<DashboardToday | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(quiet = false) {
    if (!activeGym) return
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const result = await api.gyms.dashboard.today(activeGym.id)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      load()
    }, [activeGym]),
  )

  function onRefresh() {
    setRefreshing(true)
    load(true)
  }

  const greeting = greetingFor(user?.name)

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#818cf8" />}
    >
      <Text style={styles.greeting}>{greeting}</Text>

      {loading && !refreshing && (
        <View style={styles.loadingCard}>
          <View style={styles.loadingShimmer} />
          <View style={[styles.loadingShimmer, { width: '70%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && data && (
        <>
          <WodHeroCard data={data} />
          {data.workout && (
            <LeaderboardCard
              workoutId={data.workout.id}
              workoutTitle={data.workout.title}
              myUserId={user?.id ?? ''}
            />
          )}
        </>
      )}

      {!loading && activeGym && (
        <UpcomingCard gymId={activeGym.id} />
      )}

      {/* Social feed placeholder — deferred until social features are scoped */}
      <View style={styles.socialPlaceholder}>
        <Text style={styles.socialPlaceholderText}>Social feed coming soon</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    padding: 14,
    gap: 12,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  loadingCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
    minHeight: 120,
  },
  loadingShimmer: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    width: '90%',
  },
  errorCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  socialPlaceholder: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderStyle: 'dashed',
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialPlaceholderText: {
    fontSize: 13,
    color: '#4b5563',
  },
})
