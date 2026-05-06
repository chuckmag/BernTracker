import { useEffect, useState } from 'react'
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native'
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../../App'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'
import type { TrackedMovement, StrengthTrajectoryData, StrengthTrajectoryPoint } from '../lib/api'
import { api } from '../lib/api'

type RootNav = StackNavigationProp<RootStackParamList>

const CHART_W = 220
const CHART_H = 80
const PAD = { top: 6, right: 6, bottom: 4, left: 28 }
const DOT_HIT_R = 12

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

interface TrajectoryChartProps {
  points: StrengthTrajectoryData['points']
  isDark: boolean
  selectedIndex: number | null
  onSelectIndex: (i: number | null) => void
}

function TrajectoryChart({ points, isDark, selectedIndex, onSelectIndex }: TrajectoryChartProps) {
  const { colors } = useTheme()
  const lineColor = colors.primary
  const gridColor = isDark ? '#1f2937' : '#e2e8f0'
  const tickColor = isDark ? '#6b7280' : '#64748b'

  if (points.length < 2) {
    return (
      <View style={styles.chartPlaceholder}>
        <ThemedText variant="muted" style={styles.chartPlaceholderText}>
          {points.length === 0 ? 'No load data yet' : 'Log more to see a trend'}
        </ThemedText>
      </View>
    )
  }

  const values = points.map((p) => p.e1rm ?? p.maxLoad)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const toY = (val: number) => PAD.top + innerH - ((val - minVal) / valRange) * innerH

  const polyPoints = points.map((p, i) => `${toX(i)},${toY(p.e1rm ?? p.maxLoad)}`).join(' ')
  const yTicks = [minVal, maxVal]

  return (
    <Svg width={CHART_W} height={CHART_H} accessibilityLabel="Strength PR trajectory chart">
      {yTicks.map((v, i) => (
        <Line
          key={i}
          x1={PAD.left}
          y1={toY(v)}
          x2={CHART_W - PAD.right}
          y2={toY(v)}
          stroke={gridColor}
          strokeWidth={1}
        />
      ))}
      {yTicks.map((v, i) => (
        <SvgText
          key={`t${i}`}
          x={PAD.left - 3}
          y={toY(v)}
          textAnchor="end"
          alignmentBaseline="central"
          fill={tickColor}
          fontSize={8}
        >
          {Math.round(v * 10) / 10}
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
      {points.map((p, i) => {
        const isSelected = selectedIndex === i
        return (
          <Circle
            key={i}
            cx={toX(i)}
            cy={toY(p.e1rm ?? p.maxLoad)}
            r={DOT_HIT_R}
            fill="transparent"
            onPress={() => onSelectIndex(isSelected ? null : i)}
          />
        )
      })}
      {points.map((p, i) => {
        const isSelected = selectedIndex === i
        return (
          <Circle
            key={`dot-${i}`}
            cx={toX(i)}
            cy={toY(p.e1rm ?? p.maxLoad)}
            r={isSelected ? 4 : 2.5}
            fill={lineColor}
            stroke={isSelected ? (isDark ? '#ffffff' : '#1e293b') : 'none'}
            strokeWidth={isSelected ? 1.5 : 0}
          />
        )
      })}
    </Svg>
  )
}

interface PointCalloutProps {
  point: StrengthTrajectoryPoint
  onNavigate: () => void
}

function PointCallout({ point, onNavigate }: PointCalloutProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.callout, { backgroundColor: `${colors.primary}1a` }]}>
      <View style={styles.calloutLeft}>
        <Text style={styles.calloutDate}>{fullDate(point.date)}</Text>
        <Text style={[styles.calloutEffort, { color: colors.primary }]}>{point.effort} {point.loadUnit}</Text>
        {point.e1rm !== null && (
          <Text style={[styles.calloutE1rm, { color: colors.primary }]}>Est. 1RM: {point.e1rm} {point.loadUnit}</Text>
        )}
      </View>
      <TouchableOpacity onPress={onNavigate} activeOpacity={0.7} style={styles.calloutLink}>
        <Text style={[styles.calloutLinkText, { color: colors.primary }]}>View →</Text>
      </TouchableOpacity>
    </View>
  )
}

interface StrengthPRCardProps {
  movements: TrackedMovement[]
}

export default function StrengthPRCard({ movements }: StrengthPRCardProps) {
  const { colors, isDark } = useTheme()
  const navigation = useNavigation<RootNav>()
  const [selectedId, setSelectedId] = useState<string>(movements[0]?.movementId ?? '')
  const [trajectory, setTrajectory] = useState<StrengthTrajectoryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedDotIndex, setSelectedDotIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setTrajectory(null)
    setSelectedDotIndex(null)
    api.analytics.strengthTrajectory(selectedId, '3M')
      .then(setTrajectory)
      .finally(() => setLoading(false))
  }, [selectedId])

  if (movements.length === 0) return null

  const delta =
    trajectory && trajectory.points.length >= 2
      ? trajectory.points[trajectory.points.length - 1].maxLoad - trajectory.points[0].maxLoad
      : null

  const selectedPoint = selectedDotIndex !== null ? trajectory?.points[selectedDotIndex] ?? null : null

  return (
    <ThemedView variant="card" style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Strength PRs</ThemedText>
        <ThemedText variant="muted" style={styles.subtitle}>3 months</ThemedText>
      </View>

      <View style={styles.body}>
        {/* Radio buttons */}
        <View accessibilityRole="radiogroup" accessibilityLabel="Movement selection">
          {movements.map((m) => {
            const isSelected = m.movementId === selectedId
            return (
              <TouchableOpacity
                key={m.movementId}
                onPress={() => setSelectedId(m.movementId)}
                style={styles.radioRow}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={m.name}
              >
                <View
                  style={[
                    styles.radioDot,
                    { borderColor: isSelected ? colors.primary : colors.borderInteractive },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                />
                <ThemedText
                  variant={isSelected ? 'primary' : 'tertiary'}
                  style={styles.radioLabel}
                  numberOfLines={1}
                >
                  {m.name}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Right: PR stat + chart */}
        <View style={styles.chartArea}>
          {loading && <ThemedText variant="muted" style={styles.chartPlaceholderText}>Loading…</ThemedText>}
          {!loading && trajectory && (
            <>
              <View style={styles.prRow}>
                {trajectory.currentPr !== null ? (
                  <>
                    <ThemedText style={styles.prValue}>{trajectory.currentPr} {trajectory.loadUnit}</ThemedText>
                    {delta !== null && delta !== 0 && (
                      <ThemedText
                        style={[
                          styles.delta,
                          { color: delta > 0 ? colors.successText : colors.errorText },
                        ]}
                      >
                        {delta > 0 ? '+' : ''}{delta}
                      </ThemedText>
                    )}
                  </>
                ) : (
                  <ThemedText variant="muted" style={styles.chartPlaceholderText}>No data yet</ThemedText>
                )}
              </View>
              <TrajectoryChart
                points={trajectory.points}
                isDark={isDark}
                selectedIndex={selectedDotIndex}
                onSelectIndex={setSelectedDotIndex}
              />
            </>
          )}
        </View>
      </View>

      {selectedPoint && (
        <PointCallout
          point={selectedPoint}
          onNavigate={() => navigation.navigate('WodDetail', { workoutId: selectedPoint.workoutId, from: 'wodalytics' })}
        />
      )}
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  radioLabel: {
    fontSize: 12,
    maxWidth: 110,
  },
  chartArea: {
    flex: 1,
    gap: 6,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  prValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  delta: {
    fontSize: 11,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  calloutLeft: {
    gap: 2,
  },
  calloutDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  calloutEffort: {
    fontSize: 13,
    fontWeight: '600',
  },
  calloutE1rm: {
    fontSize: 11,
  },
  calloutLink: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  calloutLinkText: {
    fontSize: 12,
    fontWeight: '600',
  },
})
