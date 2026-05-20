import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import Svg, { Circle } from 'react-native-svg'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type GoalResponse } from '../lib/api'
import GoalFormModal from './GoalFormModal'

type Nav = StackNavigationProp<RootStackParamList>

const RING_SIZE = 36
const RING_STROKE = 4
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

// ─── Progress ring ─────────────────────────────────────────────────────────────

interface ProgressRingProps {
  percent: number   // 0–100
  isHabit: boolean
  isComplete: boolean
}

function ProgressRing({ percent, isHabit, isComplete }: ProgressRingProps) {
  if (isHabit) {
    // HABIT has no numeric progress in v1 — show a hollow ring or a check.
    return (
      <View style={[styles.ring, { width: RING_SIZE, height: RING_SIZE }]}>
        <Text style={[styles.ringText, isComplete && styles.ringTextComplete]}>
          {isComplete ? '✓' : '·'}
        </Text>
      </View>
    )
  }
  const pct = Math.max(0, Math.min(100, percent))
  const offset = RING_CIRC * (1 - pct / 100)
  return (
    <View style={[styles.ring, { width: RING_SIZE, height: RING_SIZE }]}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#1f2937"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={isComplete ? '#34d399' : '#818cf8'}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          // Start the ring at 12 o'clock instead of 3.
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={styles.ringPct}>{pct}</Text>
      </View>
    </View>
  )
}

// ─── Numeric progress label ────────────────────────────────────────────────────

export function formatProgressLabel(goal: GoalResponse): string {
  const p = goal.progress
  if (p.type === 'PR_TARGET') {
    const cur = p.current === null ? '—' : String(p.current)
    const unit = p.unit ? ` ${p.unit}` : ''
    return `${cur} / ${p.target}${unit}`
  }
  if (p.type === 'FREQUENCY') {
    return `${p.workoutsLogged} / ${p.workoutsRequired} workouts`
  }
  // HABIT
  return goal.status === 'COMPLETED' ? 'Completed' : 'In progress'
}

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
      <ProgressRing percent={percent} isHabit={goal.progress.type === 'HABIT'} isComplete={isComplete} />
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
  const [goals, setGoals] = useState<GoalResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const fetchGoals = useCallback(async () => {
    setLoading(true)
    try {
      const list = await api.users.me.goals.list({ status: 'ACTIVE' })
      setGoals(list.slice(0, 3))
    } catch {
      setGoals([])
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
    setGoals((prev) => (prev ? [goal, ...prev].slice(0, 3) : [goal]))
  }

  const showEmpty = !loading && (!goals || goals.length === 0)
  const showList = !loading && goals && goals.length > 0

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

      {showEmpty && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No active goals yet</Text>
          <Text style={styles.emptyBody}>
            Set a PR target, a weekly frequency, or a habit to track your progress over time.
          </Text>
        </View>
      )}

      {showList && (
        <View>
          {goals!.map((g) => (
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
  ring: { justifyContent: 'center', alignItems: 'center' },
  ringLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringPct: { fontSize: 10, fontWeight: '700', color: '#e5e7eb' },
  ringText: { fontSize: 18, color: '#6b7280' },
  ringTextComplete: { color: '#34d399', fontWeight: '700' },
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
