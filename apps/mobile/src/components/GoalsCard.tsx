import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type GoalResponse } from '../lib/api'
import GoalFormModal from './GoalFormModal'
import GoalProgressRing from './GoalProgressRing'
import { formatProgressLabel } from '../lib/goalFormat'

// Re-exported so existing callers (`GoalsScreen` imports it from here in
// some test fixtures) still resolve. The canonical source is now
// src/lib/goalFormat.ts.
export { formatProgressLabel }

type Nav = StackNavigationProp<RootStackParamList>

const RING_SIZE = 36
const RING_STROKE = 4

// ─── Row ───────────────────────────────────────────────────────────────────────

interface GoalRowProps {
  goal: GoalResponse
  onPress: () => void
}

function GoalRow({ goal, onPress }: GoalRowProps) {
  const isComplete =
    goal.status === 'COMPLETED' ||
    (goal.progress.type !== 'HABIT' && goal.progress.isComplete)
  const percent =
    goal.progress.type === 'PR_TARGET' || goal.progress.type === 'FREQUENCY'
      ? goal.progress.percent
      : 0
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title} ${formatProgressLabel(goal)}`}
    >
      <GoalProgressRing
        percent={percent}
        isHabit={goal.progress.type === 'HABIT'}
        isComplete={isComplete}
        size={RING_SIZE}
        stroke={RING_STROKE}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{goal.title}</Text>
        <Text style={styles.rowLabel} numberOfLines={1}>{formatProgressLabel(goal)}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────────

export default function GoalsCard() {
  const navigation = useNavigation<Nav>()
  const [goals, setGoals] = useState<GoalResponse[]>([])
  const [loading, setLoading] = useState(true)
  // Separate error state so a 5xx doesn't render the empty-state "set your
  // first goal" copy. Matches the GoalsScreen pattern.
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.users.me.goals.list({ status: 'ACTIVE' })
      setGoals(list.slice(0, 3))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchGoals()
    }, [fetchGoals]),
  )

  function handleCreated(goal: GoalResponse) {
    setShowCreate(false)
    setGoals((prev) => [goal, ...prev].slice(0, 3))
  }

  const showEmpty = !loading && !error && goals.length === 0
  const showList = !loading && !error && goals.length > 0

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerText}>My Goals</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Goals')}
          accessibilityLabel="View all goals"
          accessibilityRole="button"
        >
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={styles.shimmer} />
          <View style={[styles.shimmer, { width: '70%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {showEmpty && (
        <TouchableOpacity
          style={styles.empty}
          onPress={() => setShowCreate(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Create your first goal"
        >
          <Text style={styles.emptyTitle}>No active goals yet</Text>
          <Text style={styles.emptyBody}>
            Tap here or "+ New goal" to set a PR target, weekly frequency, or habit.
          </Text>
        </TouchableOpacity>
      )}

      {showList && (
        <View>
          {goals.map((g) => (
            <GoalRow
              key={g.id}
              goal={g}
              onPress={() => navigation.navigate('GoalDetail', { goalId: g.id })}
            />
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setShowCreate(true)}
          accessibilityRole="button"
          accessibilityLabel="Create a new goal"
        >
          <Text style={styles.newBtnText}>+ New goal</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <GoalFormModal
          mode="create"
          onCancel={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </View>
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
  },
  viewAll: {
    fontSize: 12,
    color: '#818cf8',
    fontWeight: '600',
  },
  shimmerContainer: { padding: 16 },
  shimmer: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1f2937',
    width: '90%',
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  emptyBody: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#f3f4f6' },
  rowLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  errorBox: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
  },
  errorText: { color: '#fecaca', fontSize: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  newBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  newBtnText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '600',
  },
})
