import { useEffect, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type LeaderboardEntry } from '../lib/api'
import { formatResultValue } from '../lib/format'
import UserRowProfile from './UserRowProfile'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

type Nav = StackNavigationProp<RootStackParamList>

const LEVEL_LABEL: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'SC',
  MODIFIED: 'MF',
}

interface Props {
  workoutId: string
  workoutTitle: string
  myUserId: string
}

export default function LeaderboardCard({ workoutId, workoutTitle, myUserId }: Props) {
  const { colors } = useTheme()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.workouts.results(workoutId)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [workoutId])

  const top5 = entries.slice(0, 5)
  const myRank = entries.findIndex((e) => e.user.id === myUserId)
  const myEntry = myRank >= 0 ? entries[myRank] : null
  const myRowBelow = myEntry && myRank >= 5

  return (
    <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <ThemedText variant="tertiary" style={styles.headerText} numberOfLines={1}>
          Today · &ldquo;{workoutTitle}&rdquo;
        </ThemedText>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle }]} />
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle, width: '70%', marginTop: 8 }]} />
          <View style={[styles.shimmer, { backgroundColor: colors.surfaceSubtle, width: '80%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && entries.length === 0 && (
        <ThemedText variant="tertiary" style={styles.emptyText}>No results yet — be the first to log!</ThemedText>
      )}

      {!loading && entries.length > 0 && (
        <View>
          {top5.map((entry, idx) => (
            <ResultRow
              key={entry.id}
              rank={idx + 1}
              entry={entry}
              workoutId={workoutId}
              isMe={entry.user.id === myUserId}
            />
          ))}

          {myRowBelow && (
            <>
              <ThemedText variant="muted" style={styles.divider}>···</ThemedText>
              <ResultRow rank={myRank + 1} entry={myEntry} workoutId={workoutId} isMe />
            </>
          )}

          {!myEntry && (
            <ThemedText variant="muted" style={[styles.logPrompt, { borderTopColor: colors.borderSubtle }]}>
              Log your result to appear on the board
            </ThemedText>
          )}
        </View>
      )}
    </ThemedView>
  )
}

function ResultRow({
  rank,
  entry,
  workoutId,
  isMe,
}: {
  rank: number
  entry: LeaderboardEntry
  workoutId: string
  isMe: boolean
}) {
  const { colors } = useTheme()
  const navigation = useNavigation<Nav>()
  const score = formatResultValue(entry.value)

  return (
    <TouchableOpacity
      style={[styles.row, isMe && { backgroundColor: `${colors.primary}33` }]}
      onPress={() => navigation.navigate('ResultDetail', { workoutId, resultId: entry.id, from: 'dashboard' })}
      activeOpacity={0.7}
    >
      <ThemedText variant="tertiary" style={styles.rank}>{rank}</ThemedText>
      <UserRowProfile
        user={entry.user}
        onAvatarPress={() => navigation.navigate('UserProfile', { userId: entry.user.id })}
      />
      <View style={[styles.levelBadge, { backgroundColor: colors.borderInteractive }]}>
        <ThemedText variant="tertiary" style={styles.levelText}>{LEVEL_LABEL[entry.level] ?? entry.level}</ThemedText>
      </View>
      <ThemedText variant="secondary" style={styles.score}>{score}</ThemedText>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
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
  rank: {
    width: 18,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
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
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 2,
    letterSpacing: 2,
  },
  logPrompt: {
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
})
