import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Text as SvgText } from 'react-native-svg'
import type { ConsistencyData } from '../lib/api'

const WEEKS = 12
const CELL_SIZE = 10
const CELL_GAP = 2

// indigo-900 → indigo-700 → indigo-500 → indigo-400
const CELL_COLORS = ['#111827', '#312e81', '#4338ca', '#6366f1']

function cellColor(count: number): string {
  if (count === 0) return CELL_COLORS[0]
  if (count === 1) return CELL_COLORS[1]
  if (count === 2) return CELL_COLORS[2]
  return CELL_COLORS[3]
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
        <Circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1f2937" strokeWidth={strokeWidth} />
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="#6366f1"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          originX={cx}
          originY={cy}
        />
        <SvgText x={cx} y={cy} textAnchor="middle" dy="0.35em" fill="white" fontSize={16} fontWeight="700">
          {current}
        </SvgText>
      </Svg>
      <Text style={styles.ringLabel}>streak</Text>
      <Text style={styles.ringBest}>Best: {best}d</Text>
    </View>
  )
}

interface WorkoutDaysHeatmapProps {
  history: ConsistencyData['history']
  weeks?: number
}

function WorkoutDaysHeatmap({ history, weeks = WEEKS }: WorkoutDaysHeatmapProps) {
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
                  { backgroundColor: cellColor(count) },
                  isToday && styles.cellToday,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {CELL_COLORS.map((c, i) => (
          <View key={i} style={[styles.legendCell, { backgroundColor: c }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
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
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Consistency</Text>
        <Text style={styles.subtitle}>Last {weeks} weeks</Text>
      </View>
      <View style={styles.body}>
        <StreakRing current={data.currentStreak} best={data.longestStreak} size={56} />
        <WorkoutDaysHeatmap history={data.history} weeks={weeks} />
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
    alignItems: 'flex-start',
    gap: 16,
  },
  ringContainer: {
    alignItems: 'center',
    gap: 4,
  },
  ringLabel: {
    color: '#9ca3af',
    fontSize: 11,
  },
  ringBest: {
    color: '#6b7280',
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
  cellToday: {
    borderWidth: 1,
    borderColor: '#818cf8',
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
    color: '#6b7280',
    fontSize: 10,
  },
})
