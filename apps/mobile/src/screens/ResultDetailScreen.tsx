import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { useAuth } from '../context/AuthContext'
import { api, type LeaderboardEntry, type Workout } from '../lib/api'
import { formatResultValue } from '../lib/format'
import UserAvatar from '../components/UserAvatar'
import { displayNameOf } from '../components/UserRowProfile'

type Props = StackScreenProps<RootStackParamList, 'ResultDetail'>

const LEVEL_LABELS: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function scheduledDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ResultDetailScreen({ route, navigation }: Props) {
  const { workoutId, resultId, from } = route.params
  const { user: me } = useAuth()
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [result, setResult] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (from === 'dashboard') {
      navigation.setOptions({ headerBackTitle: 'Dashboard' })
    }
  }, [from, navigation])

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([api.workouts.get(workoutId), api.workouts.results(workoutId)])
      .then(([w, entries]) => {
        setWorkout(w)
        const found = entries.find((e) => e.id === resultId) ?? null
        setResult(found)
        if (!found) setError('Result not found.')
      })
      .catch((e: Error) => setError(e.message ?? 'Failed to load'))
      .finally(() => setLoading(false))
  }, [workoutId, resultId])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error || !workout || !result) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Result not found.'}</Text>
      </View>
    )
  }

  const isMe = result.user.id === me?.id
  const athleteName = displayNameOf(result.user)
  const title = isMe ? 'Your Result' : `${athleteName}'s Result`
  const score = formatResultValue(result.value)

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header: avatar + title */}
      <View style={styles.titleRow}>
        <UserAvatar
          avatarUrl={result.user.avatarUrl}
          firstName={result.user.firstName}
          lastName={result.user.lastName}
          name={result.user.name}
          size="sm"
        />
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* Workout context */}
      <View style={styles.section}>
        <Text style={styles.workoutTitle}>{workout.title}</Text>
        <Text style={styles.workoutDate}>{scheduledDateLabel(workout.scheduledAt)}</Text>
      </View>

      {/* Result */}
      <View style={styles.resultCard}>
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Result</Text>
          <Text style={styles.resultValue}>{score}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{LEVEL_LABELS[result.level] ?? result.level}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.notesLabel}>Notes</Text>
        {result.notes ? (
          <Text style={styles.notes}>{result.notes}</Text>
        ) : (
          <Text style={styles.notesEmpty}>No notes for this result.</Text>
        )}
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
    padding: 16,
    gap: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
    flexWrap: 'wrap',
  },
  section: {
    gap: 2,
  },
  workoutTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f9fafb',
  },
  workoutDate: {
    fontSize: 13,
    color: '#9ca3af',
  },
  resultCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
    gap: 10,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f9fafb',
    fontVariant: ['tabular-nums'],
  },
  levelBadge: {
    backgroundColor: '#374151',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ca3af',
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notes: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 20,
  },
  notesEmpty: {
    fontSize: 14,
    color: '#4b5563',
    fontStyle: 'italic',
  },
})
