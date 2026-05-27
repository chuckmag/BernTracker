import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

// Shared progress ring used by the home dashboard's `GoalsCard` and the
// full `GoalsScreen` list. Two near-identical copies lived in those files
// before the deep-review pass; consolidating here lets both callers vary
// only the visual size while sharing the SVG geometry, the colour rules
// (teal-while-in-progress, green-when-complete, hollow for HABIT), and
// the percent-or-checkmark inner label.
export interface GoalProgressRingProps {
  percent: number // 0–100; clamped internally
  isHabit: boolean
  isComplete: boolean
  size: number
  stroke: number
}

export default function GoalProgressRing({
  percent,
  isHabit,
  isComplete,
  size,
  stroke,
}: GoalProgressRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  if (isHabit) {
    return (
      <View style={[styles.ring, { width: size, height: size }]}>
        <Text style={[styles.ringInnerHabit, isComplete && styles.ringInnerComplete]}>
          {isComplete ? '✓' : '·'}
        </Text>
      </View>
    )
  }

  const pct = Math.max(0, Math.min(100, percent))
  const offset = circumference * (1 - pct / 100)

  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1f2937"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isComplete ? '#34d399' : '#818cf8'}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          // Start at 12 o'clock instead of 3 — feels right for "progress".
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text style={styles.ringPct}>{pct}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  ringInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringPct: { color: '#f9fafb', fontSize: 11, fontWeight: '600' },
  ringInnerHabit: { color: '#4b5563', fontSize: 14, fontWeight: '700' },
  ringInnerComplete: { color: '#34d399' },
})
