import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type Workout, type LeaderboardEntry, type WorkoutLevel } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { formatResultValue } from '../lib/format'

type Props = StackScreenProps<RootStackParamList, 'WodDetail'>

const LEVEL_FILTERS: { label: string; value: WorkoutLevel | null }[] = [
  { label: 'All', value: null },
  { label: 'RX+', value: 'RX_PLUS' },
  { label: 'RX', value: 'RX' },
  { label: 'Scaled', value: 'SCALED' },
  { label: 'Modified', value: 'MODIFIED' },
]

const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

export default function WodDetailScreen({ route, navigation }: Props) {
  const { workoutId } = route.params
  const { user } = useAuth()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<WorkoutLevel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load workout details once
  useEffect(() => {
    api.workouts.get(workoutId)
      .then((w) => {
        setWorkout(w)
        navigation.setOptions({ title: w.title })
      })
      .catch(() => setError('Could not load workout.'))
      .finally(() => setLoading(false))
  }, [workoutId, navigation])

  // Always fetch the unfiltered leaderboard and apply the level filter
  // client-side. This way the user's "your result" badge keeps showing
  // their RX entry even when the leaderboard list is filtered to RX+ —
  // their own state shouldn't depend on which filter chip is active.
  // useFocusEffect picks up create/edit/delete results on goBack from
  // LogResultScreen.
  const loadLeaderboard = useCallback(() => {
    api.workouts.results(workoutId)
      .then(setLeaderboard)
      .catch(() => {})
  }, [workoutId])

  useFocusEffect(useCallback(() => { loadLeaderboard() }, [loadLeaderboard]))

  const userResult = leaderboard.find((e) => e.user.id === user?.id)
  const hasLogged = !!userResult

  const visibleLeaderboard = useMemo(
    () => (levelFilter ? leaderboard.filter((e) => e.level === levelFilter) : leaderboard),
    [leaderboard, levelFilter],
  )

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error || !workout) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Workout not found.'}</Text>
      </View>
    )
  }

  const scheduledDate = new Date(workout.scheduledAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.typeBadgeRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{workout.type.replace('_', ' ')}</Text>
          </View>
          <Text style={styles.dateText}>{scheduledDate}</Text>
        </View>
        <Text style={styles.title}>{workout.title}</Text>
      </View>

      {/* Description */}
      {workout.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WORKOUT</Text>
          <Text style={styles.description}>{workout.description}</Text>
        </View>
      ) : null}

      {/* Log Result CTA */}
      {hasLogged ? (
        <TouchableOpacity
          style={styles.resultBadge}
          onPress={() =>
            navigation.navigate('LogResult', {
              workoutId: workout.id,
              resultId: userResult.id,
              existingResult: userResult,
            })
          }
          activeOpacity={0.8}
          testID="result-badge"
        >
          <Text style={styles.resultBadgeLabel}>YOUR RESULT — TAP TO EDIT</Text>
          <Text style={styles.resultBadgeValue}>{formatResultValue(userResult.value)}</Text>
          <Text style={styles.resultBadgeLevel}>{LEVEL_LABELS[userResult.level]}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.logButton}
          onPress={() => navigation.navigate('LogResult', { workoutId: workout.id })}
          activeOpacity={0.8}
        >
          <Text style={styles.logButtonText}>Log Result</Text>
        </TouchableOpacity>
      )}

      {/* Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>LEADERBOARD</Text>

        {/* Level filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {LEVEL_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, levelFilter === f.value && styles.chipActive]}
              onPress={() => setLevelFilter(f.value)}
            >
              <Text style={[styles.chipText, levelFilter === f.value && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {visibleLeaderboard.length === 0 ? (
          <Text style={styles.emptyLeaderboard}>
            {levelFilter ? `No ${LEVEL_LABELS[levelFilter]} results yet.` : 'No results yet.'}
          </Text>
        ) : (
          visibleLeaderboard.map((entry, idx) => (
            <View
              key={entry.id}
              style={[styles.leaderboardRow, entry.user.id === user?.id && styles.leaderboardRowHighlight]}
            >
              <Text style={styles.rank}>{idx + 1}</Text>
              <View style={styles.leaderboardInfo}>
                <Text style={styles.leaderboardName}>{entry.user.name}</Text>
                <Text style={styles.leaderboardValue}>{formatResultValue(entry.value)}</Text>
              </View>
              <Text style={styles.leaderboardLevel}>{LEVEL_LABELS[entry.level]}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  content: {
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#030712',
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  typeBadge: {
    backgroundColor: '#1e1b4b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#818cf8',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 13,
    color: '#6b7280',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 30,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4b5563',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#d1d5db',
    lineHeight: 22,
  },
  logButton: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultBadge: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#1e1b4b',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6366f1',
    letterSpacing: 0.5,
  },
  resultBadgeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  resultBadgeLevel: {
    fontSize: 12,
    color: '#818cf8',
  },
  filterRow: {
    marginBottom: 12,
  },
  filterContent: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  chipActive: {
    backgroundColor: '#1e1b4b',
    borderColor: '#6366f1',
  },
  chipText: {
    fontSize: 13,
    color: '#6b7280',
  },
  chipTextActive: {
    color: '#818cf8',
    fontWeight: '600',
  },
  emptyLeaderboard: {
    color: '#4b5563',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  leaderboardRowHighlight: {
    backgroundColor: '#1e1b4b',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  rank: {
    width: 28,
    fontSize: 14,
    fontWeight: '700',
    color: '#4b5563',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  leaderboardValue: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  leaderboardLevel: {
    fontSize: 12,
    color: '#6b7280',
  },
})
