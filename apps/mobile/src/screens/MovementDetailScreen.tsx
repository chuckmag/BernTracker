import { useEffect, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RouteProp } from '@react-navigation/native'
import type { AnalyticsStackParamList } from '../../App'
import {
  api,
  type MovementPrType,
  type MovementPrsData,
  type MovementTrajectoryData,
} from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedView from '../components/ThemedView'
import ThemedText from '../components/ThemedText'

// ── Chart constants ───────────────────────────────────────────────────────────

const CHART_W = 280
const CHART_H = 100
const PAD = { top: 8, right: 8, bottom: 4, left: 32 }
const DOT_HIT_R = 12

const RANGE_OPTIONS: { label: string; value: '1M' | '3M' | '6M' | '1Y' }[] = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
]

const PR_TYPE_LABELS: Record<MovementPrType, string> = {
  LOAD: 'Load',
  MAX_REPS: 'Max Reps',
  TIME: 'Time',
  DISTANCE: 'Distance',
  CALORIES: 'Calories',
  NONE: 'None',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

// ── Trajectory chart ──────────────────────────────────────────────────────────

interface TrajectoryChartProps {
  points: MovementTrajectoryData['points']
  selectedIndex: number | null
  onSelectIndex: (i: number | null) => void
}

function TrajectoryChart({ points, selectedIndex, onSelectIndex }: TrajectoryChartProps) {
  const { colors } = useTheme()
  const lineColor = colors.primary
  const gridColor = colors.borderSubtle
  const tickColor = colors.textTertiary

  if (points.length < 2) {
    return (
      <View style={cs.chartPlaceholder}>
        <ThemedText variant="muted" style={cs.chartPlaceholderText}>
          {points.length === 0 ? 'No data yet' : 'Log more to see a trend'}
        </ThemedText>
      </View>
    )
  }

  const values = points.map((p) => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const toY = (val: number) => PAD.top + innerH - ((val - minVal) / valRange) * innerH

  const polyPoints = points.map((p, i) => `${toX(i)},${toY(values[i])}`).join(' ')

  return (
    <Svg width={CHART_W} height={CHART_H} accessibilityLabel="Movement trajectory chart">
      {[minVal, maxVal].map((v, i) => (
        <Line key={i} x1={PAD.left} y1={toY(v)} x2={CHART_W - PAD.right} y2={toY(v)} stroke={gridColor} strokeWidth={1} />
      ))}
      {[minVal, maxVal].map((v, i) => (
        <SvgText
          key={`t${i}`}
          x={PAD.left - 3}
          y={toY(v)}
          textAnchor="end"
          alignmentBaseline="central"
          fill={tickColor}
          fontSize={8}
        >
          {Math.round(v)}
        </SvgText>
      ))}
      <Polyline
        points={polyPoints}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((_, i) => (
        <Circle
          key={i}
          cx={toX(i)}
          cy={toY(values[i])}
          r={DOT_HIT_R}
          fill="transparent"
          onPress={() => onSelectIndex(selectedIndex === i ? null : i)}
        />
      ))}
      {points.map((_, i) => {
        const isSelected = selectedIndex === i
        return (
          <Circle
            key={`dot-${i}`}
            cx={toX(i)}
            cy={toY(values[i])}
            r={isSelected ? 4 : 2.5}
            fill={lineColor}
            stroke={isSelected ? colors.textPrimary : 'none'}
            strokeWidth={isSelected ? 1.5 : 0}
          />
        )
      })}
    </Svg>
  )
}

// ── Entry row (generic) ───────────────────────────────────────────────────────

function EntryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={cs.entryRow}>
      <ThemedText variant="tertiary" style={cs.entryDate}>{label}</ThemedText>
      <ThemedText variant="secondary" style={cs.entryValue}>{value}</ThemedText>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

type Props = {
  navigation: StackNavigationProp<AnalyticsStackParamList, 'MovementDetail'>
  route: RouteProp<AnalyticsStackParamList, 'MovementDetail'>
}

export default function MovementDetailScreen({ navigation: _navigation, route }: Props) {
  const { movementId, name: _name, prTypes } = route.params
  const { colors } = useTheme()

  const [selectedPrType, setSelectedPrType] = useState<MovementPrType>(prTypes[0])
  const [range, setRange] = useState<'1M' | '3M' | '6M' | '1Y'>('3M')
  const [selectedDotIndex, setSelectedDotIndex] = useState<number | null>(null)

  const [prsData, setPrsData] = useState<MovementPrsData | null>(null)
  const [prsLoading, setPrsLoading] = useState(true)
  const [prsError, setPrsError] = useState<string | null>(null)

  const [trajectory, setTrajectory] = useState<MovementTrajectoryData | null>(null)
  const [trajectoryLoading, setTrajectoryLoading] = useState(false)

  const [refreshing, setRefreshing] = useState(false)

  async function fetchPrs() {
    setPrsError(null)
    try {
      const data = await api.analytics.movementPrs(movementId)
      setPrsData(data)
    } catch (e) {
      setPrsError(e instanceof Error ? e.message : 'Failed to load movement data')
    }
  }

  useEffect(() => {
    setPrsLoading(true)
    fetchPrs().finally(() => setPrsLoading(false))
  }, [movementId])

  useEffect(() => {
    if (selectedPrType === 'NONE') return
    setTrajectoryLoading(true)
    setTrajectory(null)
    setSelectedDotIndex(null)
    api.analytics.movementTrajectory(movementId, selectedPrType, range)
      .then(setTrajectory)
      .catch(() => setTrajectory(null))
      .finally(() => setTrajectoryLoading(false))
  }, [movementId, selectedPrType, range])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchPrs()
    setRefreshing(false)
  }

  const entries = prsData?.byType[selectedPrType]?.entries ?? []
  const selectedPoint = selectedDotIndex !== null ? trajectory?.points[selectedDotIndex] ?? null : null

  return (
    <ScrollView
      style={[cs.container, { backgroundColor: colors.screenBg }]}
      contentContainerStyle={cs.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      {/* PR type tab strip (only shown when multiple prTypes) */}
      {prTypes.length > 1 && (
        <ThemedView variant="card" style={cs.tabStrip} accessibilityRole="tablist">
          {prTypes.map((pt) => (
            <TouchableOpacity
              key={pt}
              style={[cs.tab, selectedPrType === pt && { backgroundColor: colors.borderSubtle }]}
              onPress={() => { setSelectedPrType(pt); setSelectedDotIndex(null) }}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedPrType === pt }}
              accessibilityLabel={PR_TYPE_LABELS[pt]}
            >
              <ThemedText
                variant={selectedPrType === pt ? undefined : 'tertiary'}
                style={[cs.tabText, selectedPrType === pt && cs.tabTextActive]}
              >
                {PR_TYPE_LABELS[pt]}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ThemedView>
      )}

      {prsLoading && (
        <View style={cs.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {!prsLoading && prsError && <ThemedText style={[cs.error, { color: colors.errorText }]}>{prsError}</ThemedText>}

      {!prsLoading && !prsError && (
        <>
          {/* Trajectory chart */}
          {selectedPrType !== 'NONE' && (
            <ThemedView variant="card" style={cs.chartCard}>
              <View style={cs.chartHeader}>
                <ThemedText style={cs.chartTitle}>Trajectory</ThemedText>
                <View style={cs.rangeStrip}>
                  {RANGE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        cs.rangeChip,
                        { backgroundColor: range === opt.value ? colors.borderInteractive : colors.borderSubtle },
                      ]}
                      onPress={() => setRange(opt.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: range === opt.value }}
                    >
                      <ThemedText
                        variant={range === opt.value ? undefined : 'tertiary'}
                        style={[cs.rangeChipText, range === opt.value && cs.rangeChipTextActive]}
                      >
                        {opt.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {trajectoryLoading ? (
                <View style={cs.chartPlaceholder}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <TrajectoryChart
                  points={trajectory?.points ?? []}
                  selectedIndex={selectedDotIndex}
                  onSelectIndex={setSelectedDotIndex}
                />
              )}

              {selectedPoint && (
                <View style={[cs.callout, { backgroundColor: `${colors.primary}1a` }]}>
                  <ThemedText variant="tertiary" style={cs.calloutDate}>{formatDate(selectedPoint.achievedAt)}</ThemedText>
                  <ThemedText style={[cs.calloutValue, { color: colors.primary }]}>{selectedPoint.label}</ThemedText>
                </View>
              )}
            </ThemedView>
          )}

          {/* PR entries table */}
          {entries.length > 0 && (
            <ThemedView variant="card" style={cs.tableCard}>
              <ThemedText style={cs.tableTitle}>
                {PR_TYPE_LABELS[selectedPrType]} PRs
              </ThemedText>
              <View style={cs.tableBody}>
                {(entries as Array<{ achievedAt?: string; label?: string }>).map((e, i) => (
                  <EntryRow
                    key={i}
                    label={e.achievedAt ? shortDate(e.achievedAt) : '—'}
                    value={e.label ?? '—'}
                  />
                ))}
              </View>
            </ThemedView>
          )}

          {entries.length === 0 && !trajectoryLoading && (
            <View style={cs.emptyState}>
              <ThemedText variant="muted">No {PR_TYPE_LABELS[selectedPrType].toLowerCase()} PRs recorded yet.</ThemedText>
            </View>
          )}

          {/* Recent appearances */}
          {prsData && prsData.recentAppearances.length > 0 && (
            <ThemedView variant="card" style={cs.tableCard}>
              <ThemedText style={cs.tableTitle}>Recent Appearances</ThemedText>
              <View style={cs.tableBody}>
                {prsData.recentAppearances.map((a, i) => (
                  <EntryRow
                    key={i}
                    label={shortDate(a.scheduledAt)}
                    value={a.workoutName}
                  />
                ))}
              </View>
            </ThemedView>
          )}
        </>
      )}
    </ScrollView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  center: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  error: {
    fontSize: 14,
  },

  // Tab strip (pr types)
  tabStrip: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '600',
  },

  // Chart card
  chartCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rangeStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  rangeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rangeChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  rangeChipTextActive: {
    fontWeight: '600',
  },
  chartPlaceholder: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    fontSize: 11,
  },
  callout: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  calloutDate: {
    fontSize: 11,
  },
  calloutValue: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Table card
  tableCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  tableBody: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    fontSize: 12,
  },
  entryValue: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
})
