import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg'
import type { TrackedMovement, StrengthTrajectoryData } from '../lib/api'
import { api } from '../lib/api'

const CHART_W = 220
const CHART_H = 80
const PAD = { top: 6, right: 6, bottom: 4, left: 28 }

function TrajectoryChart({ points }: { points: StrengthTrajectoryData['points'] }) {
  if (points.length < 2) {
    return (
      <View style={styles.chartPlaceholder}>
        <Text style={styles.chartPlaceholderText}>
          {points.length === 0 ? 'No load data yet' : 'Log more to see a trend'}
        </Text>
      </View>
    )
  }

  const loads = points.map((p) => p.maxLoad)
  const minLoad = Math.min(...loads)
  const maxLoad = Math.max(...loads)
  const loadRange = maxLoad - minLoad || 1
  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const toY = (load: number) => PAD.top + innerH - ((load - minLoad) / loadRange) * innerH

  const polyPoints = points.map((p, i) => `${toX(i)},${toY(p.maxLoad)}`).join(' ')
  const yTicks = [minLoad, maxLoad]

  return (
    <Svg width={CHART_W} height={CHART_H} accessibilityLabel="Strength PR trajectory chart">
      {yTicks.map((v, i) => (
        <Line
          key={i}
          x1={PAD.left}
          y1={toY(v)}
          x2={CHART_W - PAD.right}
          y2={toY(v)}
          stroke="#1f2937"
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
          fill="#6b7280"
          fontSize={8}
        >
          {Math.round(v)}
        </SvgText>
      ))}
      <Polyline
        points={polyPoints}
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <Circle key={i} cx={toX(i)} cy={toY(p.maxLoad)} r={2.5} fill="#6366f1" />
      ))}
    </Svg>
  )
}

interface StrengthPRCardProps {
  movements: TrackedMovement[]
}

export default function StrengthPRCard({ movements }: StrengthPRCardProps) {
  const [selectedId, setSelectedId] = useState<string>(movements[0]?.movementId ?? '')
  const [trajectory, setTrajectory] = useState<StrengthTrajectoryData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    setTrajectory(null)
    api.analytics.strengthTrajectory(selectedId, '3M')
      .then(setTrajectory)
      .finally(() => setLoading(false))
  }, [selectedId])

  if (movements.length === 0) return null

  const delta =
    trajectory && trajectory.points.length >= 2
      ? trajectory.points[trajectory.points.length - 1].maxLoad - trajectory.points[0].maxLoad
      : null

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Strength PRs</Text>
        <Text style={styles.subtitle}>3 months</Text>
      </View>

      <View style={styles.body}>
        {/* Radio buttons */}
        <View style={styles.radioGroup} accessibilityRole="radiogroup" accessibilityLabel="Movement selection">
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
                <View style={[styles.radioDot, isSelected && styles.radioDotSelected]} />
                <Text
                  style={[styles.radioLabel, isSelected && styles.radioLabelSelected]}
                  numberOfLines={1}
                >
                  {m.name}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Right: PR stat + chart */}
        <View style={styles.chartArea}>
          {loading && <Text style={styles.chartPlaceholderText}>Loading…</Text>}
          {!loading && trajectory && (
            <>
              <View style={styles.prRow}>
                {trajectory.currentPr !== null ? (
                  <>
                    <Text style={styles.prValue}>{trajectory.currentPr} {trajectory.loadUnit}</Text>
                    {delta !== null && delta !== 0 && (
                      <Text style={[styles.delta, delta > 0 ? styles.deltaPos : styles.deltaNeg]}>
                        {delta > 0 ? '+' : ''}{delta}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.chartPlaceholderText}>No data yet</Text>
                )}
              </View>
              <TrajectoryChart points={trajectory.points} />
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
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
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 12,
  },
  body: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  radioGroup: {
    gap: 6,
    flexShrink: 0,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4b5563',
  },
  radioDotSelected: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f1',
  },
  radioLabel: {
    color: '#9ca3af',
    fontSize: 12,
    maxWidth: 110,
  },
  radioLabelSelected: {
    color: '#ffffff',
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
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  delta: {
    fontSize: 11,
    fontWeight: '600',
  },
  deltaPos: {
    color: '#34d399',
  },
  deltaNeg: {
    color: '#f87171',
  },
  chartPlaceholder: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    color: '#6b7280',
    fontSize: 11,
  },
})
