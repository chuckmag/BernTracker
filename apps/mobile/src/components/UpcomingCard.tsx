import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { api, type Workout } from '../lib/api'
import { styleFor } from '../lib/workoutTypeStyles'

const MAX_DAYS = 4

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const tomorrowKey = addDays(new Date(), 1).toISOString().slice(0, 10)
  if (dateKey === tomorrowKey) return 'TOMORROW'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
}

interface Props {
  gymId: string
  programIds?: string[]
}

export default function UpcomingCard({ gymId, programIds }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const tomorrow = addDays(new Date(), 1)
    tomorrow.setHours(0, 0, 0, 0)
    const end = addDays(new Date(), 6)
    end.setHours(23, 59, 59, 999)
    api.gyms.workouts(gymId, tomorrow.toISOString(), end.toISOString(), programIds)
      .then((data) => setWorkouts(data.filter((w) => w.status === 'PUBLISHED')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [gymId, programIds?.join(',')])

  const byDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    const key = w.scheduledAt.slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(w)
  }
  const days = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_DAYS)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerText}>COMING UP</Text>
      </View>

      {loading && (
        <View style={styles.shimmerContainer}>
          <View style={styles.shimmer} />
          <View style={[styles.shimmer, { width: '75%', marginTop: 8 }]} />
        </View>
      )}

      {!loading && days.length === 0 && (
        <Text style={styles.emptyText}>Nothing scheduled in the next 5 days</Text>
      )}

      {!loading && days.map(([dateKey, dayWorkouts], i) => {
        const isLast = i === days.length - 1
        return (
          <View key={dateKey} style={[styles.dayBlock, !isLast && styles.dayBorder]}>
            <Text style={styles.dayLabel}>{formatDayLabel(dateKey)}</Text>
            {dayWorkouts.map((workout) => {
              const ts = styleFor(workout.type)
              return (
                <TouchableOpacity key={workout.id} style={[styles.workoutRow, { borderLeftColor: ts.accentBar }]} activeOpacity={0.7}>
                  <View style={[styles.typeBadge, { backgroundColor: ts.bgTint }]}>
                    <Text style={[styles.typeAbbr, { color: ts.tint }]}>{ts.abbr}</Text>
                  </View>
                  <Text style={styles.workoutTitle} numberOfLines={1}>{workout.title}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
  },
  shimmerContainer: {
    padding: 16,
  },
  shimmer: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1f2937',
    width: '90%',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  dayBlock: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  dayBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  dayLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4b5563',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderLeftWidth: 3,
  },
  typeBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  typeAbbr: {
    fontSize: 9,
    fontWeight: '700',
  },
  workoutTitle: {
    flex: 1,
    fontSize: 13,
    color: '#f9fafb',
  },
})
