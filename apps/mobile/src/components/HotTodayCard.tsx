import { useEffect, useState } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type LeaderboardEntry } from '../lib/api'
import { formatResultValue } from '../lib/format'
import UserRowProfile from './UserRowProfile'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

const LEVEL_LABEL: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'SC',
  MODIFIED: 'MF',
}

function hotScore(e: LeaderboardEntry): number {
  return e._count.reactions + e._count.comments * 2
}

interface Props {
  workoutId: string
}

type Nav = StackNavigationProp<RootStackParamList>

export default function HotTodayCard({ workoutId }: Props) {
  const { colors } = useTheme()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.workouts.results(workoutId)
      .then((results) => {
        const sorted = [...results]
          .sort((a, b) => hotScore(b) - hotScore(a) || b._count.reactions - a._count.reactions)
          .slice(0, 3)
          .filter((e) => hotScore(e) > 0)
        setEntries(sorted)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workoutId])

  return (
    <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <ThemedText variant="tertiary" style={styles.headerText}>🔥 Hot Today</ThemedText>
        <ThemedText variant="muted" style={styles.subText}>most reacted results</ThemedText>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle }]} />
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle, width: '70%', marginTop: 8 }]} />
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle, width: '80%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && entries.length === 0 && (
        <ThemedText variant="tertiary" style={styles.emptyText}>No reactions yet — be the first to cheer someone on</ThemedText>
      )}

      {!loading && entries.length > 0 && (
        <View>
          {entries.map((entry) => (
            <HotRow key={entry.id} entry={entry} workoutId={workoutId} />
          ))}
        </View>
      )}
    </ThemedView>
  )
}

function HotRow({ entry, workoutId }: { entry: LeaderboardEntry; workoutId: string }) {
  const { colors } = useTheme()
  const navigation = useNavigation<Nav>()
  const score = formatResultValue(entry.value)
  const totalReactions = entry._count.reactions
  const totalComments = entry._count.comments

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('ResultDetail', { workoutId, resultId: entry.id, from: 'dashboard' })}
      activeOpacity={0.7}
    >
      <View style={styles.userCell}>
        <UserRowProfile
          user={entry.user}
          onAvatarPress={() => navigation.navigate('UserProfile', { userId: entry.user.id })}
        />
      </View>

      <View style={[styles.levelBadge, { backgroundColor: colors.borderInteractive }]}>
        <ThemedText variant="tertiary" style={styles.levelText}>{LEVEL_LABEL[entry.level] ?? entry.level}</ThemedText>
      </View>
      <ThemedText variant="tertiary" style={styles.score}>{score}</ThemedText>

      <View style={styles.counts}>
        {totalReactions > 0 && (
          <ThemedText variant="tertiary" style={styles.countChip} accessibilityLabel={`${totalReactions} reactions`}>
            🔥 {totalReactions}
          </ThemedText>
        )}
        {totalComments > 0 && (
          <ThemedText variant="tertiary" style={styles.countChip} accessibilityLabel={`${totalComments} comments`}>
            💬 {totalComments}
          </ThemedText>
        )}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subText: {
    fontSize: 10,
    marginTop: 2,
  },
  shimmerContainer: {
    padding: 16,
  },
  shimmer: {
    height: 14,
    borderRadius: 7,
    width: '90%',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  userCell: {
    flex: 1,
    minWidth: 0,
  },
  levelBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '700',
  },
  score: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  countChip: {
    fontSize: 12,
  },
})
