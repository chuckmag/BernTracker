import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native'
import Svg, { Polyline, Circle, Line, Text as SvgText, Rect } from 'react-native-svg'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RouteProp } from '@react-navigation/native'
import type { RootStackParamList } from '../../App'
import {
  api,
  type GoalResponse,
  type MovementTrajectoryData,
} from '../lib/api'
import GoalFormModal, { HABIT_V2_COPY } from '../components/GoalFormModal'
import MovementHistorySection from '../components/MovementHistorySection'

type Nav = StackNavigationProp<RootStackParamList, 'GoalDetail'>
type RouteP = RouteProp<RootStackParamList, 'GoalDetail'>

// ─── Chart constants ───────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 160
const PAD = { top: 12, right: 12, bottom: 18, left: 36 }

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── PR target trajectory chart with reference line ────────────────────────────

interface PrTrajectoryChartProps {
  points: MovementTrajectoryData['points']
  target: number
  unit: string | null
}

function PrTrajectoryChart({ points, target, unit }: PrTrajectoryChartProps) {
  if (points.length === 0) {
    return (
      <View style={chartStyles.placeholder}>
        <Text style={chartStyles.placeholderText}>No data yet — log a result to see progress.</Text>
      </View>
    )
  }
  const values = points.map((p) => p.value)
  const minVal = Math.min(...values, target)
  const maxVal = Math.max(...values, target)
  const range = maxVal - minVal || 1
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const toX = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const toY = (val: number) => PAD.top + innerH - ((val - minVal) / range) * innerH

  const poly = points.map((p, i) => `${toX(i)},${toY(values[i])}`).join(' ')
  const targetY = toY(target)
  const targetLabel = unit ? `Target: ${target}${unit}` : `Target: ${target}`

  return (
    <Svg width={CHART_W} height={CHART_H} accessibilityLabel="PR target trajectory chart">
      {/* Axes */}
      <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={CHART_H - PAD.bottom} stroke="#1f2937" strokeWidth={1} />
      <Line x1={PAD.left} y1={CHART_H - PAD.bottom} x2={CHART_W - PAD.right} y2={CHART_H - PAD.bottom} stroke="#1f2937" strokeWidth={1} />

      {/* Min / max ticks */}
      <SvgText x={PAD.left - 4} y={toY(minVal)} textAnchor="end" alignmentBaseline="central" fill="#6b7280" fontSize={9}>
        {Math.round(minVal)}
      </SvgText>
      <SvgText x={PAD.left - 4} y={toY(maxVal)} textAnchor="end" alignmentBaseline="central" fill="#6b7280" fontSize={9}>
        {Math.round(maxVal)}
      </SvgText>

      {/* Reference line at target */}
      <Line
        x1={PAD.left}
        y1={targetY}
        x2={CHART_W - PAD.right}
        y2={targetY}
        stroke="#f59e0b"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <SvgText
        // Label rendered in the top-right corner of the chart, per spec.
        x={CHART_W - PAD.right}
        y={PAD.top + 2}
        textAnchor="end"
        alignmentBaseline="hanging"
        fill="#f59e0b"
        fontSize={10}
        fontWeight="600"
      >
        {targetLabel}
      </SvgText>

      {/* Trajectory line */}
      {points.length > 1 && (
        <Polyline
          points={poly}
          fill="none"
          stroke="#818cf8"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Dots */}
      {points.map((_, i) => (
        <Circle
          key={`dot-${i}`}
          cx={toX(i)}
          cy={toY(values[i])}
          r={3}
          fill="#818cf8"
        />
      ))}
    </Svg>
  )
}

// ─── Frequency overall progress bar ────────────────────────────────────────────
//
// Earlier revision drew per-week bars by distributing `workoutsLogged` evenly
// across past weeks (the API only returns aggregates in v1). That looked like
// real per-week history but was fabricated — a 12+0 week distribution rendered
// as 6+6 to the viewer. Replaced with a single overall progress bar that
// reflects the data we actually have. When the API exposes a per-week
// breakdown (`progress.weeklyCounts`?), this can return as a real bar chart.

interface FrequencyBarChartProps {
  workoutsLogged: number
  workoutsRequired: number
  perWeek: number
  weeks: number
  currentWeekCount: number
}

function FrequencyBarChart({ workoutsLogged, workoutsRequired, perWeek, weeks, currentWeekCount }: FrequencyBarChartProps) {
  // Server validation forbids `perWeek <= 0` or `weeks <= 0`, but the call
  // site coerces nulls with `?? 0` — guard so a drifted goal record doesn't
  // produce NaNs.
  if (workoutsRequired <= 0 || perWeek <= 0 || weeks <= 0) return null

  const ratio = Math.min(1, workoutsLogged / workoutsRequired)
  const barW = CHART_W - PAD.left - PAD.right
  const filledW = barW * ratio
  const barY = PAD.top + 16
  const barH = 14
  const pct = Math.round(ratio * 100)

  return (
    <View>
      <Svg width={CHART_W} height={barY + barH + 8} accessibilityLabel="Overall frequency progress bar">
        {/* Track */}
        <Rect x={PAD.left} y={barY} width={barW} height={barH} fill="#1f2937" rx={barH / 2} />
        {/* Fill */}
        {filledW > 0 && (
          <Rect
            x={PAD.left}
            y={barY}
            width={filledW}
            height={barH}
            fill={ratio >= 1 ? '#22c55e' : '#818cf8'}
            rx={barH / 2}
          />
        )}
        {/* Percentage label */}
        <SvgText
          x={PAD.left + barW / 2}
          y={barY + barH / 2 + 1}
          textAnchor="middle"
          alignmentBaseline="central"
          fill="#f9fafb"
          fontSize={10}
          fontWeight="700"
        >
          {`${pct}%`}
        </SvgText>
      </Svg>
      <View style={chartStyles.legendRow}>
        <Text style={chartStyles.legendText}>
          Logged: <Text style={chartStyles.legendBold}>{workoutsLogged}</Text> of {workoutsRequired}
        </Text>
        <Text style={chartStyles.legendText}>
          This week: <Text style={chartStyles.legendBold}>{currentWeekCount}</Text>/{perWeek}
        </Text>
      </View>
    </View>
  )
}

// ─── Action menu ───────────────────────────────────────────────────────────────

interface ActionMenuProps {
  visible: boolean
  status: GoalResponse['status']
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onClose: () => void
}

function ActionMenu({ visible, status, onEdit, onArchive, onDelete, onClose }: ActionMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.menuBackdrop} onPress={onClose}>
        <Pressable style={s.menu} onPress={(e) => e.stopPropagation()}>
          <TouchableOpacity style={s.menuItem} onPress={onEdit}>
            <Text style={s.menuItemText}>Edit</Text>
          </TouchableOpacity>
          {status !== 'ARCHIVED' && (
            <TouchableOpacity style={s.menuItem} onPress={onArchive}>
              <Text style={s.menuItemText}>Archive</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.menuItem} onPress={onDelete}>
            <Text style={[s.menuItemText, s.menuItemDanger]}>Delete</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<RouteP>()
  const { goalId } = route.params

  const [goal, setGoal] = useState<GoalResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PR-target trajectory only fetched when relevant.
  const [trajectory, setTrajectory] = useState<MovementTrajectoryData | null>(null)
  const [trajectoryLoading, setTrajectoryLoading] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [updating, setUpdating] = useState(false)

  const fetchGoal = useCallback(async () => {
    setError(null)
    try {
      const g = await api.goals.get(goalId)
      setGoal(g)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goal')
    }
  }, [goalId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchGoal().finally(() => setLoading(false))
    }, [fetchGoal]),
  )

  // For PR Target on a Movement, pull a trajectory so the chart has data.
  useEffect(() => {
    if (!goal) return
    if (goal.type !== 'PR_TARGET') return
    if (!goal.movementId || !goal.targetPrType) return
    setTrajectoryLoading(true)
    api.analytics
      // `targetPrType` is `TargetPrType` (excludes NONE) — a structural
      // subtype of `MovementPrType`, so no cast is needed.
      .movementTrajectory(goal.movementId, goal.targetPrType, '1Y')
      .then(setTrajectory)
      .catch(() => setTrajectory(null))
      .finally(() => setTrajectoryLoading(false))
  }, [goal])

  async function handleArchive() {
    if (!goal) return
    setShowMenu(false)
    setUpdating(true)
    try {
      const updated = await api.users.me.goals.update(goal.id, { status: 'ARCHIVED' })
      setGoal(updated)
    } catch (e) {
      Alert.alert('Could not archive', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setUpdating(false)
    }
  }

  async function handleDelete() {
    if (!goal) return
    setShowMenu(false)
    Alert.alert(
      'Delete goal?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.users.me.goals.remove(goal.id)
              navigation.goBack()
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Unknown error')
            }
          },
        },
      ],
      { cancelable: true },
    )
  }

  async function handleMarkComplete() {
    if (!goal) return
    setUpdating(true)
    try {
      const updated = await api.users.me.goals.update(goal.id, { status: 'COMPLETED' })
      setGoal(updated)
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setUpdating(false)
    }
  }

  function handleEdited(g: GoalResponse) {
    setShowEdit(false)
    setGoal(g)
  }

  // Reference-line label uses the target's display unit.
  const targetUnit = useMemo(() => {
    if (!goal || goal.progress.type !== 'PR_TARGET') return null
    return goal.progress.unit
  }, [goal])

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error || !goal) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>{error ?? 'Goal not found'}</Text>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{goal.title}</Text>
            <Text style={s.subtitle}>
              {goal.type === 'PR_TARGET' ? 'PR Target' : goal.type === 'FREQUENCY' ? 'Frequency' : 'Habit'}
              {' · '}
              {goal.targetDate ? formatDate(goal.targetDate) : 'no target date'}
            </Text>
            <Text style={s.subtitle}>Status: {goal.status}</Text>
          </View>
          <TouchableOpacity
            style={s.menuBtn}
            onPress={() => setShowMenu(true)}
            accessibilityLabel="Goal actions"
            accessibilityRole="button"
          >
            <Text style={s.menuBtnText}>⋯</Text>
          </TouchableOpacity>
        </View>

        {/* PR Target detail */}
        {goal.type === 'PR_TARGET' && goal.progress.type === 'PR_TARGET' && (
          <View style={s.chartCard}>
            {/* Movement attribution. MovementDetail lives in the nested
                Analytics tab stack — cross-stack push from a root-stack
                screen is non-trivial to type, and the inline
                MovementHistorySection below already exposes the PR table +
                backfill + past results that the standalone screen would
                show. Leaving this as a label for now; if a clean cross-
                stack hop is wanted later, file as a #130 follow-up. */}
            {goal.movementId && goal.movement && (
              <Text style={s.movementLabel}>
                {goal.movement.name}
              </Text>
            )}
            <Text style={s.chartTitle}>Trajectory</Text>
            {trajectoryLoading ? (
              <View style={chartStyles.placeholder}>
                <ActivityIndicator size="small" color="#818cf8" />
              </View>
            ) : (
              <PrTrajectoryChart
                points={trajectory?.points ?? []}
                target={goal.progress.target}
                unit={targetUnit}
              />
            )}
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statLabel}>Current</Text>
                <Text style={s.statValue}>
                  {goal.progress.current ?? '—'}
                  {goal.progress.unit ? ` ${goal.progress.unit}` : ''}
                </Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Target</Text>
                <Text style={s.statValue}>
                  {goal.progress.target}
                  {goal.progress.unit ? ` ${goal.progress.unit}` : ''}
                </Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Progress</Text>
                <Text style={s.statValue}>{goal.progress.percent}%</Text>
              </View>
            </View>
          </View>
        )}

        {/* Movement history + backfill modal. Reuses the existing component
            from the WodDetail flow. Tapping an empty RM cell opens the
            BackfillModal which auto-creates a personal-program workout
            and logs the result — so "add previous lifts" works without
            navigating away. Only shown for movement-PR goals. */}
        {goal.type === 'PR_TARGET' && goal.movementId && goal.movement && (
          <MovementHistorySection
            movementId={goal.movementId}
            movementName={goal.movement.name}
            navigation={navigation}
          />
        )}

        {/* Frequency detail */}
        {goal.type === 'FREQUENCY' && goal.progress.type === 'FREQUENCY' && (
          <View style={s.chartCard}>
            <Text style={s.chartTitle}>Weekly progress</Text>
            <FrequencyBarChart
              workoutsLogged={goal.progress.workoutsLogged}
              workoutsRequired={goal.progress.workoutsRequired}
              perWeek={goal.frequencyPerWeek ?? 0}
              weeks={goal.frequencyWeeks ?? 0}
              currentWeekCount={goal.progress.currentWeekCount}
            />
            <View style={s.statRow}>
              <View style={s.stat}>
                <Text style={s.statLabel}>Logged</Text>
                <Text style={s.statValue}>{goal.progress.workoutsLogged}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Required</Text>
                <Text style={s.statValue}>{goal.progress.workoutsRequired}</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statLabel}>Weeks left</Text>
                <Text style={s.statValue}>{goal.progress.weeksRemaining}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Habit detail */}
        {goal.type === 'HABIT' && (
          <View style={s.chartCard}>
            <Text style={s.chartTitle}>Habit</Text>
            <Text style={s.habitMeta}>
              Target date: <Text style={s.habitMetaBold}>{goal.targetDate ? formatDate(goal.targetDate) : 'none'}</Text>
            </Text>
            {goal.status === 'COMPLETED' ? (
              <View style={s.habitDone}>
                <Text style={s.habitDoneText}>Completed</Text>
                {goal.completedAt && (
                  <Text style={s.habitDoneDate}>on {formatDate(goal.completedAt)}</Text>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={[s.completeBtn, updating && s.completeBtnDisabled]}
                onPress={handleMarkComplete}
                disabled={updating}
                accessibilityRole="button"
                accessibilityLabel="Mark goal complete"
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.completeBtnText}>Mark complete</Text>
                )}
              </TouchableOpacity>
            )}
            <View style={s.habitPlaceholder}>
              <Text style={s.habitPlaceholderText}>{HABIT_V2_COPY}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <ActionMenu
        visible={showMenu}
        status={goal.status}
        onClose={() => setShowMenu(false)}
        onEdit={() => {
          setShowMenu(false)
          setShowEdit(true)
        }}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {showEdit && (
        <GoalFormModal
          mode="edit"
          initialGoal={goal}
          onCancel={() => setShowEdit(false)}
          onSaved={handleEdited}
        />
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  errorText: { color: '#f87171', fontSize: 14 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { color: '#f9fafb', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBtnText: { color: '#cbd5e1', fontSize: 18, fontWeight: '700' },

  chartCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  chartTitle: { color: '#f3f4f6', fontSize: 14, fontWeight: '600' },
  movementLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },

  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statLabel: { color: '#6b7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: '#f3f4f6', fontSize: 16, fontWeight: '600', marginTop: 4 },

  habitMeta: { color: '#cbd5e1', fontSize: 13 },
  habitMetaBold: { color: '#f3f4f6', fontWeight: '600' },
  habitDone: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  habitDoneText: { color: '#34d399', fontWeight: '700', fontSize: 15 },
  habitDoneDate: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  completeBtn: {
    backgroundColor: '#4338ca',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  habitPlaceholder: {
    borderRadius: 8,
    backgroundColor: '#1f2937',
    padding: 12,
  },
  habitPlaceholderText: { color: '#6b7280', fontSize: 12, textAlign: 'center' },

  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menu: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingBottom: 28,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  menuItemText: { color: '#e5e7eb', fontSize: 15, fontWeight: '500' },
  menuItemDanger: { color: '#f87171' },
})

const chartStyles = StyleSheet.create({
  placeholder: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#6b7280', fontSize: 12 },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  legendText: { color: '#9ca3af', fontSize: 11 },
  legendBold: { color: '#f3f4f6', fontWeight: '700' },
})
