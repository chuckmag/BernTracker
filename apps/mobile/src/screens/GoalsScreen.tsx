import { useCallback, useState } from 'react'
import { formatProgressLabel } from '../lib/goalFormat'
import GoalProgressRing from '../components/GoalProgressRing'
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
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type GoalResponse, type GoalStatus, type GoalType } from '../lib/api'
import GoalFormModal from '../components/GoalFormModal'

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
      <GoalProgressRing
        percent={percent}
        isHabit={goal.progress.type === 'HABIT'}
        isComplete={isComplete}
        size={RING_SIZE}
        stroke={RING_STROKE}
      />
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
  // [] = "loaded, no items"; the separate `loading` flag covers
  // "not yet loaded", so a tri-state isn't needed.
  const [goals, setGoals] = useState<GoalResponse[]>([])
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

  // useFocusEffect covers mount + every refocus, and `fetchGoals`'s identity
  // changes whenever `tab` changes (its only dep), so tab switches also fire
  // through this hook. A second useEffect on the same dep would just
  // double-fetch on every interaction.
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchGoals().finally(() => setLoading(false))
    }, [fetchGoals]),
  )

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

        {!loading && !error && goals.length === 0 && (
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

        {!loading && goals.length > 0 && (
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
