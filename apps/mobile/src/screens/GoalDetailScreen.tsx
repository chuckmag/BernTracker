import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
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
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

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
  const { colors } = useTheme()
  if (points.length === 0) {
    return (
      <View style={chartStyles.placeholder}>
        <ThemedText variant="tertiary" style={chartStyles.placeholderText}>
          No data yet — log a result to see progress.
        </ThemedText>
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
      <Line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={CHART_H - PAD.bottom} stroke={colors.borderSubtle} strokeWidth={1} />
      <Line x1={PAD.left} y1={CHART_H - PAD.bottom} x2={CHART_W - PAD.right} y2={CHART_H - PAD.bottom} stroke={colors.borderSubtle} strokeWidth={1} />

      {/* Min / max ticks */}
      <SvgText x={PAD.left - 4} y={toY(minVal)} textAnchor="end" alignmentBaseline="central" fill={colors.textTertiary} fontSize={9}>
        {Math.round(minVal)}
      </SvgText>
      <SvgText x={PAD.left - 4} y={toY(maxVal)} textAnchor="end" alignmentBaseline="central" fill={colors.textTertiary} fontSize={9}>
        {Math.round(maxVal)}
      </SvgText>

      {/* Reference line at target */}
      <Line
        x1={PAD.left}
        y1={targetY}
        x2={CHART_W - PAD.right}
        y2={targetY}
        stroke={colors.warningText}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <SvgText
        // Label rendered in the top-right corner of the chart, per spec.
        x={CHART_W - PAD.right}
        y={PAD.top + 2}
        textAnchor="end"
        alignmentBaseline="hanging"
        fill={colors.warningText}
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
          stroke={colors.primary}
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
          fill={colors.primary}
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
  const { colors } = useTheme()
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
        <Rect x={PAD.left} y={barY} width={barW} height={barH} fill={colors.borderSubtle} rx={barH / 2} />
        {/* Fill */}
        {filledW > 0 && (
          <Rect
            x={PAD.left}
            y={barY}
            width={filledW}
            height={barH}
            fill={ratio >= 1 ? colors.successText : colors.primary}
            rx={barH / 2}
          />
        )}
        {/* Percentage label is centred on the whole bar. The fill grows from
            the left, so until it reaches the midpoint the label sits over
            the empty track — `onPrimary` (white) is invisible on the
            light-mode track (`borderSubtle` ≈ #e2e8f0, ~1.05:1). Flip to
            `textPrimary` until the fill covers the label's position.
            In dark mode both colours are #ffffff so this is a no-op. */}
        <SvgText
          x={PAD.left + barW / 2}
          y={barY + barH / 2 + 1}
          textAnchor="middle"
          alignmentBaseline="central"
          fill={filledW >= barW / 2 ? colors.onPrimary : colors.textPrimary}
          fontSize={10}
          fontWeight="700"
        >
          {`${pct}%`}
        </SvgText>
      </Svg>
      <View style={chartStyles.legendRow}>
        <ThemedText variant="tertiary" style={chartStyles.legendText}>
          Logged: <ThemedText style={chartStyles.legendBold}>{workoutsLogged}</ThemedText> of {workoutsRequired}
        </ThemedText>
        <ThemedText variant="tertiary" style={chartStyles.legendText}>
          This week: <ThemedText style={chartStyles.legendBold}>{currentWeekCount}</ThemedText>/{perWeek}
        </ThemedText>
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
  const { colors } = useTheme()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.menuBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <ThemedView variant="card" style={s.menu}>
            <TouchableOpacity style={[s.menuItem, { borderBottomColor: colors.borderSubtle }]} onPress={onEdit}>
              <ThemedText style={s.menuItemText}>Edit</ThemedText>
            </TouchableOpacity>
            {status !== 'ARCHIVED' && (
              <TouchableOpacity style={[s.menuItem, { borderBottomColor: colors.borderSubtle }]} onPress={onArchive}>
                <ThemedText style={s.menuItemText}>Archive</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.menuItem, { borderBottomColor: colors.borderSubtle }]} onPress={onDelete}>
              <ThemedText style={[s.menuItemText, { color: colors.errorText }]}>Delete</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function GoalDetailScreen() {
  const { colors } = useTheme()
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
      <ThemedView variant="screen" style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (error || !goal) {
    return (
      <ThemedView variant="screen" style={s.center}>
        <ThemedText style={[s.errorText, { color: colors.errorText }]}>{error ?? 'Goal not found'}</ThemedText>
      </ThemedView>
    )
  }

  return (
    <ThemedView variant="screen" style={s.container}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.title}>{goal.title}</ThemedText>
            <ThemedText variant="tertiary" style={s.subtitle}>
              {goal.type === 'PR_TARGET' ? 'PR Target' : goal.type === 'FREQUENCY' ? 'Frequency' : 'Habit'}
              {' · '}
              {goal.targetDate ? formatDate(goal.targetDate) : 'no target date'}
            </ThemedText>
            <ThemedText variant="tertiary" style={s.subtitle}>Status: {goal.status}</ThemedText>
          </View>
          <TouchableOpacity
            style={[s.menuBtn, { backgroundColor: colors.borderSubtle }]}
            onPress={() => setShowMenu(true)}
            accessibilityLabel="Goal actions"
            accessibilityRole="button"
          >
            <ThemedText variant="secondary" style={s.menuBtnText}>⋯</ThemedText>
          </TouchableOpacity>
        </View>

        {/* PR Target detail */}
        {goal.type === 'PR_TARGET' && goal.progress.type === 'PR_TARGET' && (
          <ThemedView variant="card" style={[s.chartCard, { borderColor: colors.borderSubtle }]}>
            {/* Movement attribution. MovementDetail lives in the nested
                Analytics tab stack — cross-stack push from a root-stack
                screen is non-trivial to type, and the inline
                MovementHistorySection below already exposes the PR table +
                backfill + past results that the standalone screen would
                show. Leaving this as a label for now; if a clean cross-
                stack hop is wanted later, file as a #130 follow-up. */}
            {goal.movementId && goal.movement && (
              <ThemedText variant="tertiary" style={s.movementLabel}>
                {goal.movement.name}
              </ThemedText>
            )}
            <ThemedText style={s.chartTitle}>Trajectory</ThemedText>
            {trajectoryLoading ? (
              <View style={chartStyles.placeholder}>
                <ActivityIndicator size="small" color={colors.primary} />
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
                <ThemedText variant="tertiary" style={s.statLabel}>Current</ThemedText>
                <ThemedText style={s.statValue}>
                  {goal.progress.current ?? '—'}
                  {goal.progress.unit ? ` ${goal.progress.unit}` : ''}
                </ThemedText>
              </View>
              <View style={s.stat}>
                <ThemedText variant="tertiary" style={s.statLabel}>Target</ThemedText>
                <ThemedText style={s.statValue}>
                  {goal.progress.target}
                  {goal.progress.unit ? ` ${goal.progress.unit}` : ''}
                </ThemedText>
              </View>
              <View style={s.stat}>
                <ThemedText variant="tertiary" style={s.statLabel}>Progress</ThemedText>
                <ThemedText style={s.statValue}>{goal.progress.percent}%</ThemedText>
              </View>
            </View>
          </ThemedView>
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
          <ThemedView variant="card" style={[s.chartCard, { borderColor: colors.borderSubtle }]}>
            <ThemedText style={s.chartTitle}>Weekly progress</ThemedText>
            <FrequencyBarChart
              workoutsLogged={goal.progress.workoutsLogged}
              workoutsRequired={goal.progress.workoutsRequired}
              perWeek={goal.frequencyPerWeek ?? 0}
              weeks={goal.frequencyWeeks ?? 0}
              currentWeekCount={goal.progress.currentWeekCount}
            />
            <View style={s.statRow}>
              <View style={s.stat}>
                <ThemedText variant="tertiary" style={s.statLabel}>Logged</ThemedText>
                <ThemedText style={s.statValue}>{goal.progress.workoutsLogged}</ThemedText>
              </View>
              <View style={s.stat}>
                <ThemedText variant="tertiary" style={s.statLabel}>Required</ThemedText>
                <ThemedText style={s.statValue}>{goal.progress.workoutsRequired}</ThemedText>
              </View>
              <View style={s.stat}>
                <ThemedText variant="tertiary" style={s.statLabel}>Weeks left</ThemedText>
                <ThemedText style={s.statValue}>{goal.progress.weeksRemaining}</ThemedText>
              </View>
            </View>
          </ThemedView>
        )}

        {/* Habit detail */}
        {goal.type === 'HABIT' && (
          <ThemedView variant="card" style={[s.chartCard, { borderColor: colors.borderSubtle }]}>
            <ThemedText style={s.chartTitle}>Habit</ThemedText>
            <ThemedText variant="secondary" style={s.habitMeta}>
              Target date: <ThemedText style={s.habitMetaBold}>{goal.targetDate ? formatDate(goal.targetDate) : 'none'}</ThemedText>
            </ThemedText>
            {goal.status === 'COMPLETED' ? (
              <View style={[s.habitDone, { backgroundColor: `${colors.successText}26` }]}>
                <ThemedText style={[s.habitDoneText, { color: colors.successText }]}>Completed</ThemedText>
                {goal.completedAt && (
                  <ThemedText variant="tertiary" style={s.habitDoneDate}>on {formatDate(goal.completedAt)}</ThemedText>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  s.completeBtn,
                  { backgroundColor: colors.primary },
                  updating && s.completeBtnDisabled,
                ]}
                onPress={handleMarkComplete}
                disabled={updating}
                accessibilityRole="button"
                accessibilityLabel="Mark goal complete"
              >
                {updating ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <ThemedText style={[s.completeBtnText, { color: colors.onPrimary }]}>Mark complete</ThemedText>
                )}
              </TouchableOpacity>
            )}
            <View style={[s.habitPlaceholder, { backgroundColor: colors.borderSubtle }]}>
              <ThemedText variant="tertiary" style={s.habitPlaceholderText}>{HABIT_V2_COPY}</ThemedText>
            </View>
          </ThemedView>
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
    </ThemedView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
//
// Static module-level styles. Theme-dependent properties (backgrounds,
// borders, foreground colors) are layered on inline via useTheme(); see
// apps/mobile/CLAUDE.md → *Design system*.

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 14 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBtnText: { fontSize: 18, fontWeight: '700' },

  chartCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  chartTitle: { fontSize: 14, fontWeight: '600' },
  movementLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },

  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 16, fontWeight: '600', marginTop: 4 },

  habitMeta: { fontSize: 13 },
  habitMetaBold: { fontWeight: '600' },
  habitDone: {
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  habitDoneText: { fontWeight: '700', fontSize: 15 },
  habitDoneDate: { fontSize: 12, marginTop: 4 },
  completeBtn: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: { fontSize: 15, fontWeight: '700' },
  habitPlaceholder: {
    borderRadius: 8,
    padding: 12,
  },
  habitPlaceholderText: { fontSize: 12, textAlign: 'center' },

  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menu: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingBottom: 28,
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  menuItemText: { fontSize: 15, fontWeight: '500' },
})

const chartStyles = StyleSheet.create({
  placeholder: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { fontSize: 12 },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  legendText: { fontSize: 11 },
  legendBold: { fontWeight: '700' },
})
