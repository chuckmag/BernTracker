import { View, StyleSheet } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import type { ConsistencyData } from '../lib/api'
import { useTheme, type ThemeColors } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

const WEEKS = 12
const CELL_SIZE = 10
const CELL_GAP = 2

// Heatmap intensity scale. 0 = empty (matches the card surface), 1/2/3+ ramp
// up the saturation of the brand-primary using the opacity-suffix pattern so
// the scale stays intelligible across both themes.
function cellColorScale(colors: ThemeColors): [string, string, string, string] {
  return [
    colors.borderSubtle,
    `${colors.primary}33`, // ~20% opacity
    `${colors.primary}99`, // ~60% opacity
    colors.primary,
  ]
}

function cellColor(count: number, scale: readonly string[]): string {
  if (count === 0) return scale[0]
  if (count === 1) return scale[1]
  if (count === 2) return scale[2]
  return scale[3]
}

function toUtcKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

interface StreakRingProps {
  current: number
  best: number
  size?: number
}

function StreakRing({ current, best, size = 56 }: StreakRingProps) {
  const { colors } = useTheme()
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = best > 0 ? Math.min(current / best, 1) : 0
  const dashOffset = circumference * (1 - progress)
  const cx = size / 2
  const cy = size / 2

  return (
    <View style={styles.ringContainer}>
      <Svg width={size} height={size} accessibilityLabel={`Current streak: ${current} days`}>
        <Circle cx={cx} cy={cy} r={radius} fill="none" stroke={colors.borderSubtle} strokeWidth={strokeWidth} />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          originX={cx}
          originY={cy}
        />
        <SvgText x={cx} y={cy} textAnchor="middle" dy="0.35em" fill={colors.textPrimary} fontSize={16} fontWeight="700">
          {current}
        </SvgText>
      </Svg>
      <ThemedText variant="tertiary" style={styles.ringLabel}>streak</ThemedText>
      <ThemedText variant="muted" style={styles.ringBest}>Best: {best}d</ThemedText>
    </View>
  )
}

interface WorkoutDaysHeatmapProps {
  history: ConsistencyData['history']
  weeks?: number
}

function WorkoutDaysHeatmap({ history, weeks = WEEKS }: WorkoutDaysHeatmapProps) {
  const { colors } = useTheme()
  const scale = cellColorScale(colors)
  const countByDate: Record<string, number> = {}
  for (const { date, count } of history) {
    countByDate[date] = count
  }

  const today = new Date()
  const todayKey = toUtcKey(today)
  const dayOfWeek = today.getUTCDay()
  const startDate = new Date(today)
  startDate.setUTCDate(today.getUTCDate() - dayOfWeek - (weeks - 1) * 7)
  startDate.setUTCHours(0, 0, 0, 0)

  const columns: { dateKey: string; count: number; isToday: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: { dateKey: string; count: number; isToday: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate)
      cellDate.setUTCDate(startDate.getUTCDate() + w * 7 + d)
      const dateKey = toUtcKey(cellDate)
      col.push({ dateKey, count: countByDate[dateKey] ?? 0, isToday: dateKey === todayKey })
    }
    columns.push(col)
  }

  return (
    <View style={styles.heatmapContainer}>
      <View style={styles.heatmapGrid} accessibilityLabel="Workout days heatmap">
        {columns.map((col, wi) => (
          <View key={wi} style={styles.heatmapColumn}>
            {col.map(({ dateKey, count, isToday }) => (
              <View
                key={dateKey}
                style={[
                  styles.cell,
                  { backgroundColor: cellColor(count, scale) },
                  isToday && { borderWidth: 1, borderColor: colors.primary },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <ThemedText variant="muted" style={styles.legendText}>Less</ThemedText>
        {scale.map((c, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <ThemedText variant="muted" style={styles.legendText}>More</ThemedText>
      </View>
    </View>
  )
}

interface ConsistencyCardProps {
  data: ConsistencyData
  weeks?: number
}

export default function ConsistencyCard({ data, weeks = WEEKS }: ConsistencyCardProps) {
  return (
    <ThemedView variant="card" style={styles.card}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Consistency</ThemedText>
        <ThemedText variant="tertiary" style={styles.subtitle}>Last {weeks} weeks</ThemedText>
      </View>
      <View style={styles.body}>
        <StreakRing current={data.currentStreak} best={data.longestStreak} size={56} />
        <WorkoutDaysHeatmap history={data.history} weeks={weeks} />
      </View>
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
    alignItems: 'flex-start',
    gap: 16,
  },
  ringContainer: {
    alignItems: 'center',
    gap: 4,
  },
  ringLabel: {
    fontSize: 11,
  },
  ringBest: {
    fontSize: 11,
  },
  heatmapContainer: {
    flex: 1,
    gap: 6,
  },
  heatmapGrid: {
    flexDirection: 'row',
    gap: CELL_GAP,
  },
  heatmapColumn: {
    flexDirection: 'column',
    gap: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendCell: {
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 10,
  },
})
