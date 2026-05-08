import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type LeaderboardEntry } from '../lib/api'
import { formatResultValue } from '../lib/format'
import UserRowProfile from './UserRowProfile'

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
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerText} numberOfLines={1}>
          Today · &ldquo;{workoutTitle}&rdquo;
        </Text>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={styles.shimmer} />
          <View style={[styles.shimmer, { width: '70%', marginTop: 8 }]} />
          <View style={[styles.shimmer, { width: '80%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>No results yet — be the first to log!</Text>
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
              <Text style={styles.divider}>···</Text>
              <ResultRow rank={myRank + 1} entry={myEntry} workoutId={workoutId} isMe />
            </>
          )}

          {!myEntry && (
            <Text style={styles.logPrompt}>Log your result to appear on the board</Text>
          )}
        </View>
      )}
    </View>
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
  const navigation = useNavigation<Nav>()
  const score = formatResultValue(entry.value)

  return (
    <TouchableOpacity
      style={[styles.row, isMe && styles.myRow]}
      onPress={() => navigation.navigate('ResultDetail', { workoutId, resultId: entry.id, from: 'dashboard' })}
      activeOpacity={0.7}
    >
      <Text style={styles.rank}>{rank}</Text>
      <UserRowProfile
        user={entry.user}
        onAvatarPress={() => navigation.navigate('UserProfile', { userId: entry.user.id })}
      />
      <View style={styles.levelBadge}>
        <Text style={styles.levelText}>{LEVEL_LABEL[entry.level] ?? entry.level}</Text>
      </View>
      <Text style={styles.score}>{score}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
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
    backgroundColor: '#1f2937',
    width: '90%',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
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
  myRow: {
    backgroundColor: 'rgba(67,56,202,0.2)',
  },
  rank: {
    width: 18,
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
  },
  levelBadge: {
    backgroundColor: '#374151',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9ca3af',
  },
  score: {
    fontSize: 13,
    color: '#e5e7eb',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
    paddingVertical: 2,
    letterSpacing: 2,
  },
  logPrompt: {
    fontSize: 11,
    color: '#4b5563',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
})
