import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import Svg, { Circle } from 'react-native-svg'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type GoalResponse, type GoalStatus, type GoalType } from '../lib/api'
import GoalFormModal from '../components/GoalFormModal'
import { formatProgressLabel } from '../components/GoalsCard'

type Nav = StackNavigationProp<RootStackParamList>

const TAB_LABELS: Record<GoalStatus, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
}

const TYPE_ICON: Record<GoalType, string> = {
  PR_TARGET: '🎯',
  FREQUENCY: '📆',
  HABIT: '🔁',
}

const RING_SIZE = 40
const RING_STROKE = 4
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

function ProgressRing({ percent, isHabit, isComplete }: { percent: number; isHabit: boolean; isComplete: boolean }) {
  if (isHabit) {
    return (
      <View style={[s.ring, { width: RING_SIZE, height: RING_SIZE }]}>
        <Text style={[s.ringInnerHabit, isComplete && s.ringInnerComplete]}>
          {isComplete ? '✓' : '·'}
        </Text>
      </View>
    )
  }
  const pct = Math.max(0, Math.min(100, percent))
  const offset = RING_CIRC * (1 - pct / 100)
  return (
    <View style={[s.ring, { width: RING_SIZE, height: RING_SIZE }]}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} stroke="#1f2937" strokeWidth={RING_STROKE} fill="none" />
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
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={s.ringInner}>
        <Text style={s.ringPct}>{pct}</Text>
      </View>
    </View>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'No target date'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtUpdated(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface RowProps {
  goal: GoalResponse
  onPress: () => void
}

function GoalListRow({ goal, onPress }: RowProps) {
  const percent =
    goal.progress.type === 'PR_TARGET' || goal.progress.type === 'FREQUENCY'
      ? goal.progress.percent
      : 0
  const isComplete =
    goal.status === 'COMPLETED' ||
    (goal.progress.type !== 'HABIT' && goal.progress.isComplete)
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title} ${formatProgressLabel(goal)}`}
    >
      <ProgressRing percent={percent} isHabit={goal.progress.type === 'HABIT'} isComplete={isComplete} />
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>
          <Text style={s.rowIcon}>{TYPE_ICON[goal.type]} </Text>
          {goal.title}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>{formatProgressLabel(goal)}</Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {fmtDate(goal.targetDate)} · updated {fmtUpdated(goal.updatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default function GoalsScreen() {
  const navigation = useNavigation<Nav>()
  const [tab, setTab] = useState<GoalStatus>('ACTIVE')
  const [goals, setGoals] = useState<GoalResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const fetchGoals = useCallback(async () => {
    setError(null)
    try {
      const list = await api.users.me.goals.list({ status: tab })
      setGoals(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals')
    }
  }, [tab])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchGoals().finally(() => setLoading(false))
    }, [fetchGoals]),
  )

  useEffect(() => {
    setLoading(true)
    fetchGoals().finally(() => setLoading(false))
  }, [fetchGoals])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchGoals()
    setRefreshing(false)
  }

  function handleCreated(g: GoalResponse) {
    setShowCreate(false)
    if (g.status === tab) {
      setGoals((prev) => (prev ? [g, ...prev] : [g]))
    }
  }

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#818cf8" />}
      >
        <View style={s.tabStrip} accessibilityRole="tablist">
          {(['ACTIVE', 'COMPLETED', 'ARCHIVED'] as GoalStatus[]).map((status) => (
            <TouchableOpacity
              key={status}
              style={[s.tab, tab === status && s.tabActive]}
              onPress={() => setTab(status)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === status }}
              accessibilityLabel={TAB_LABELS[status]}
            >
              <Text style={[s.tabText, tab === status && s.tabTextActive]}>{TAB_LABELS[status]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && (
          <View style={s.center}>
            <ActivityIndicator color="#818cf8" />
          </View>
        )}

        {!loading && error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && goals && goals.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No {TAB_LABELS[tab].toLowerCase()} goals</Text>
            <Text style={s.emptyBody}>
              {tab === 'ACTIVE'
                ? 'Set your first goal to start tracking your progress.'
                : tab === 'COMPLETED'
                  ? 'Completed goals will appear here once you finish one.'
                  : 'Archived goals will appear here.'}
            </Text>
          </View>
        )}

        {!loading && goals && goals.length > 0 && (
          <View style={s.list}>
            {goals.map((g) => (
              <GoalListRow
                key={g.id}
                goal={g}
                onPress={() => navigation.navigate('GoalDetail', { goalId: g.id })}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={s.fab}
        onPress={() => setShowCreate(true)}
        accessibilityRole="button"
        accessibilityLabel="Create a new goal"
      >
        <Text style={s.fabIcon}>+</Text>
      </TouchableOpacity>

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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  tabStrip: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabActive: { backgroundColor: '#1f2937' },
  tabText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#ffffff', fontWeight: '600' },
  center: { paddingVertical: 40, alignItems: 'center' },
  errorBox: { backgroundColor: '#111827', borderRadius: 12, padding: 16 },
  errorText: { color: '#f87171', fontSize: 13 },
  empty: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 20,
    gap: 6,
    alignItems: 'center',
  },
  emptyTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '600' },
  emptyBody: { color: '#9ca3af', fontSize: 12, textAlign: 'center', lineHeight: 17 },

  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#f9fafb', fontSize: 14, fontWeight: '600' },
  rowIcon: { fontSize: 14 },
  rowMeta: { color: '#cbd5e1', fontSize: 12, marginTop: 2 },
  rowSub: { color: '#6b7280', fontSize: 11, marginTop: 2 },

  ring: { justifyContent: 'center', alignItems: 'center' },
  ringInner: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  ringPct: { color: '#e5e7eb', fontWeight: '700', fontSize: 11 },
  ringInnerHabit: { color: '#6b7280', fontSize: 18 },
  ringInnerComplete: { color: '#34d399', fontWeight: '700' },

  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4338ca',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  fabIcon: { color: '#ffffff', fontSize: 26, lineHeight: 28, fontWeight: '700' },
})
