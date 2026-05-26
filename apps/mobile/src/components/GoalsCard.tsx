import { useCallback, useState } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type GoalResponse } from '../lib/api'
import GoalFormModal from './GoalFormModal'
import GoalProgressRing from './GoalProgressRing'
import { formatProgressLabel } from '../lib/goalFormat'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

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
  const { colors } = useTheme()
  const isComplete =
    goal.status === 'COMPLETED' ||
    (goal.progress.type !== 'HABIT' && goal.progress.isComplete)
  const percent =
    goal.progress.type === 'PR_TARGET' || goal.progress.type === 'FREQUENCY'
      ? goal.progress.percent
      : 0
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
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
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{goal.title}</ThemedText>
        <ThemedText variant="tertiary" style={styles.rowLabel} numberOfLines={1}>
          {formatProgressLabel(goal)}
        </ThemedText>
      </View>
    </TouchableOpacity>
  )
}

// ─── Card ──────────────────────────────────────────────────────────────────────

export default function GoalsCard() {
  const { colors } = useTheme()
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
    <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <ThemedText variant="tertiary" style={styles.headerText}>My Goals</ThemedText>
        <TouchableOpacity
          onPress={() => navigation.navigate('Goals')}
          accessibilityLabel="View all goals"
          accessibilityRole="button"
        >
          <ThemedText style={[styles.viewAll, { color: colors.primary }]}>View all</ThemedText>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={[styles.shimmer, { backgroundColor: colors.borderSubtle }]} />
          <View style={[styles.shimmer, { backgroundColor: colors.borderSubtle, width: '70%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && error && (
        <View style={[styles.errorBox, { backgroundColor: `${colors.errorText}1a` }]}>
          <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error}</ThemedText>
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
          <ThemedText style={styles.emptyTitle}>No active goals yet</ThemedText>
          <ThemedText variant="tertiary" style={styles.emptyBody}>
            Tap here or "+ New goal" to set a PR target, weekly frequency, or habit.
          </ThemedText>
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

      <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: colors.borderSubtle }]}
          onPress={() => setShowCreate(true)}
          accessibilityRole="button"
          accessibilityLabel="Create a new goal"
        >
          <ThemedText style={[styles.newBtnText, { color: colors.primary }]}>+ New goal</ThemedText>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <GoalFormModal
          mode="create"
          onCancel={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}
    </ThemedView>
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
  },
  viewAll: {
    fontSize: 12,
    fontWeight: '600',
  },
  shimmerContainer: { padding: 16 },
  shimmer: {
    height: 14,
    borderRadius: 7,
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
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowLabel: { fontSize: 12, marginTop: 2 },
  errorBox: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorText: { fontSize: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  newBtn: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  newBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
})
