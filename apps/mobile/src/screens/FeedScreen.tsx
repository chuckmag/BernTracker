import { useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { FeedStackParamList } from '../../App'
import { api, type Workout } from '../lib/api'
import { useGym } from '../context/GymContext'

type Props = StackScreenProps<FeedStackParamList, 'Feed'>

const TYPE_ABBR: Record<string, string> = {
  WARMUP: 'W', STRENGTH: 'S', AMRAP: 'A',
  FOR_TIME: 'F', EMOM: 'E', CARDIO: 'C', METCON: 'M',
}

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function formatDateHeader(dateKey: string): string {
  const today = toDateKey(new Date())
  const tomorrow = toDateKey(new Date(Date.now() + 86400000))
  const d = new Date(dateKey + 'T12:00:00')
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  if (dateKey === today) return `TODAY — ${label}`
  if (dateKey === tomorrow) return `TOMORROW — ${label}`
  return label.toUpperCase()
}

interface DayBlock {
  date: string
  workouts: Workout[]
}

function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeAbbr}>{TYPE_ABBR[workout.type] ?? '?'}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{workout.title}</Text>
          <Text style={styles.cardType}>{workout.type.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  )
}

function DayBlockItem({ block, onWorkoutPress }: { block: DayBlock; onWorkoutPress: (id: string) => void }) {
  return (
    <View style={styles.dayBlock}>
      <Text style={styles.dayHeader}>{formatDateHeader(block.date)}</Text>
      <View style={styles.divider} />
      {block.workouts.map((w) => (
        <WorkoutCard key={w.id} workout={w} onPress={() => onWorkoutPress(w.id)} />
      ))}
    </View>
  )
}

export default function FeedScreen({ navigation }: Props) {
  const { activeGym } = useGym()
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadFeed = useCallback(async (silent = false) => {
    if (!activeGym) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const today = new Date()
      const end = new Date(today)
      end.setDate(end.getDate() + 6)
      const from = today.toISOString()
      const to = end.toISOString()

      const workouts = await api.gyms.workouts(activeGym.id, from, to)

      // Group by date, published only
      const byDate: Record<string, Workout[]> = {}
      for (const w of workouts) {
        if (w.status !== 'PUBLISHED') continue
        const key = toDateKey(new Date(w.scheduledAt))
        if (!byDate[key]) byDate[key] = []
        byDate[key].push(w)
      }

      const blocks: DayBlock[] = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, ws]) => ({ date, workouts: ws }))

      setDayBlocks(blocks)
    } catch {
      setError('Could not load workouts. Pull to refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeGym])

  useFocusEffect(useCallback(() => { loadFeed() }, [loadFeed]))

  function handleRefresh() {
    setRefreshing(true)
    loadFeed(true)
  }

  if (!activeGym) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No gym selected.</Text>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={dayBlocks.length === 0 ? styles.centerContent : styles.listContent}
      data={dayBlocks}
      keyExtractor={(b) => b.date}
      renderItem={({ item }) => (
        <DayBlockItem
          block={item}
          onWorkoutPress={(id) => navigation.navigate('WodDetail', { workoutId: id })}
        />
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error ?? 'No workouts scheduled this week.'}</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#818cf8"
        />
      }
    />
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
  },
  listContent: {
    paddingVertical: 16,
  },
  centerContent: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#030712',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  dayBlock: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  dayHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeAbbr: {
    fontSize: 13,
    fontWeight: '700',
    color: '#818cf8',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  cardType: {
    fontSize: 12,
    color: '#6b7280',
  },
  chevron: {
    fontSize: 20,
    color: '#4b5563',
    marginLeft: 8,
  },
})
