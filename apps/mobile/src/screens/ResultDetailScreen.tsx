import { useEffect, useState } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { useAuth } from '../context/AuthContext'
import { api, type LeaderboardEntry, type Workout } from '../lib/api'
import { formatResultValue } from '../lib/format'
import UserAvatar from '../components/UserAvatar'
import { displayNameOf } from '../components/UserRowProfile'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

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
  const { colors } = useTheme()
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
      <ThemedView variant="screen" style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (error || !workout || !result) {
    return (
      <ThemedView variant="screen" style={styles.centered}>
        <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error ?? 'Result not found.'}</ThemedText>
      </ThemedView>
    )
  }

  const isMe = result.user.id === me?.id
  const athleteName = displayNameOf(result.user)
  const title = isMe ? 'Your Result' : `${athleteName}'s Result`
  const score = formatResultValue(result.value)

  return (
    <ThemedView variant="screen" style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header: avatar + title */}
        <View style={styles.titleRow}>
          <UserAvatar
            avatarUrl={result.user.avatarUrl}
            firstName={result.user.firstName}
            lastName={result.user.lastName}
            name={result.user.name}
            size="sm"
          />
          <ThemedText style={styles.title}>{title}</ThemedText>
        </View>

        {/* Workout context */}
        <View style={styles.section}>
          <ThemedText style={styles.workoutTitle}>{workout.title}</ThemedText>
          <ThemedText variant="tertiary" style={styles.workoutDate}>{scheduledDateLabel(workout.scheduledAt)}</ThemedText>
        </View>

        {/* Result */}
        <ThemedView variant="card" style={[styles.resultCard, { borderColor: colors.borderSubtle }]}>
          <View style={styles.resultRow}>
            <ThemedText variant="tertiary" style={styles.resultLabel}>Result</ThemedText>
            <ThemedText style={styles.resultValue}>{score}</ThemedText>
            <View style={[styles.levelBadge, { backgroundColor: colors.borderInteractive }]}>
              <ThemedText variant="tertiary" style={styles.levelText}>{LEVEL_LABELS[result.level] ?? result.level}</ThemedText>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <ThemedText variant="tertiary" style={styles.notesLabel}>Notes</ThemedText>
          {result.notes ? (
            <ThemedText variant="secondary" style={styles.notes}>{result.notes}</ThemedText>
          ) : (
            <ThemedText variant="muted" style={styles.notesEmpty}>No notes for this result.</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
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
    flex: 1,
    flexWrap: 'wrap',
  },
  section: {
    gap: 2,
  },
  workoutTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  workoutDate: {
    fontSize: 13,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  levelBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notes: {
    fontSize: 14,
    lineHeight: 20,
  },
  notesEmpty: {
    fontSize: 14,
    fontStyle: 'italic',
  },
})
