import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type LeaderboardEntry } from '../lib/api'
import { formatResultValue } from '../lib/format'

const LEVEL_LABEL: Record<string, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'SC',
  MODIFIED: 'MF',
}

function hotScore(e: LeaderboardEntry): number {
  return e._count.reactions + e._count.comments * 2
}

function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return `${parts[0][0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?'
}

interface Props {
  workoutId: string
}

type Nav = StackNavigationProp<RootStackParamList>

export default function HotTodayCard({ workoutId }: Props) {
  const nav = useNavigation<Nav>()
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

  function goToWorkout() {
    nav.navigate('WodDetail', { workoutId })
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerText}>🔥 Hot Today</Text>
        <Text style={styles.subText}>most reacted results</Text>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={styles.shimmer} />
          <View style={[styles.shimmer, { width: '70%', marginTop: 8 }]} />
          <View style={[styles.shimmer, { width: '80%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && entries.length === 0 && (
        <Text style={styles.emptyText}>No reactions yet — be the first to cheer someone on</Text>
      )}

      {!loading && entries.length > 0 && (
        <View>
          {entries.map((entry) => (
            <HotRow key={entry.id} entry={entry} onPress={goToWorkout} />
          ))}
        </View>
      )}
    </View>
  )
}

function HotRow({ entry, onPress }: { entry: LeaderboardEntry; onPress: () => void }) {
  const score = formatResultValue(entry.value)
  const totalReactions = entry._count.reactions
  const totalComments = entry._count.comments

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(entry.user.name)}</Text>
      </View>

      <View style={styles.nameBlock}>
        <Text style={styles.name} numberOfLines={1}>{entry.user.name ?? '—'}</Text>
        <View style={styles.metaRow}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{LEVEL_LABEL[entry.level] ?? entry.level}</Text>
          </View>
          <Text style={styles.score}>{score}</Text>
        </View>
      </View>

      <View style={styles.counts}>
        {totalReactions > 0 && (
          <Text style={styles.countChip} accessibilityLabel={`${totalReactions} reactions`}>
            🔥 {totalReactions}
          </Text>
        )}
        {totalComments > 0 && (
          <Text style={styles.countChip} accessibilityLabel={`${totalComments} comments`}>
            💬 {totalComments}
          </Text>
        )}
      </View>
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
  },
  subText: {
    fontSize: 10,
    color: '#4b5563',
    marginTop: 2,
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
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#d1d5db',
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 13,
    fontWeight: '500',
    color: '#f9fafb',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
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
    fontSize: 11,
    color: '#9ca3af',
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
    color: '#6b7280',
  },
})
