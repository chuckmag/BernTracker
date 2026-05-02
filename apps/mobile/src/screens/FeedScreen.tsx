import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { FeedStackParamList, MainTabParamList, RootStackParamList } from '../../App'
import { api, type Workout } from '../lib/api'
import { styleFor, WORKOUT_TYPE_STYLES, type WorkoutTypeStyle } from '../lib/workoutTypeStyles'
import { useGym } from '../context/GymContext'
import { useProgramFilter } from '../context/ProgramFilterContext'
import ProgramFilterPicker from '../components/ProgramFilterPicker'

type Props = CompositeScreenProps<
  StackScreenProps<FeedStackParamList, 'Feed'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, 'FeedTab'>,
    StackScreenProps<RootStackParamList>
  >
>

// Initial window when the screen first opens. Subsequent infinite-scroll
// pages load PAGE_DAYS at a time as the user scrolls into older days.
const INITIAL_DAYS = 30
const PAGE_DAYS = 30

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function toDateKey(d: Date) {
  // YYYY-MM-DD in local time (the API gives UTC scheduledAt, but we want
  // calendar-day grouping by the user's local date so workouts in their
  // gym's evening don't fall onto "tomorrow").
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateHeader(dateKey: string): string {
  const today = toDateKey(new Date())
  const yesterday = toDateKey(addDays(new Date(), -1))
  const d = new Date(dateKey + 'T12:00:00')
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  if (dateKey === today) return `TODAY — ${label}`
  if (dateKey === yesterday) return `YESTERDAY — ${label}`
  return label.toUpperCase()
}

interface DayBlock {
  date: string
  workouts: Workout[]
}

// Build a contiguous list of day blocks from `start` (oldest) up to and
// including `end` (newest), in newest-first order. Days without workouts
// still get a block so the user sees "No workouts planned".
function buildDayBlocks(workouts: Workout[], start: Date, end: Date): DayBlock[] {
  const byDate: Record<string, Workout[]> = {}
  for (const w of workouts) {
    if (w.status !== 'PUBLISHED') continue
    const key = toDateKey(new Date(w.scheduledAt))
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(w)
  }

  const blocks: DayBlock[] = []
  let cursor = startOfDay(end)
  const startMidnight = startOfDay(start)
  while (cursor.getTime() >= startMidnight.getTime()) {
    const key = toDateKey(cursor)
    blocks.push({ date: key, workouts: byDate[key] ?? [] })
    cursor = addDays(cursor, -1)
  }
  return blocks
}

function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  const ts = styleFor(workout.type)
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <View style={[styles.typeBadge, { backgroundColor: ts.bgTint }]}>
          <Text style={[styles.typeAbbr, { color: ts.tint }]}>{ts.abbr}</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{workout.title}</Text>
          <Text style={styles.cardType}>{ts.label}</Text>
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
      {block.workouts.length === 0 ? (
        <View style={styles.emptyDay}>
          <Text style={styles.emptyDayText}>No workouts planned</Text>
        </View>
      ) : (
        block.workouts.map((w) => (
          <WorkoutCard key={w.id} workout={w} onPress={() => onWorkoutPress(w.id)} />
        ))
      )}
    </View>
  )
}

export default function FeedScreen({ navigation }: Props) {
  const { activeGym } = useGym()
  const { selected: selectedProgramIds } = useProgramFilter()
  const [dayBlocks, setDayBlocks] = useState<DayBlock[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracks the oldest day already loaded; the next "load more" page fetches
  // the PAGE_DAYS days immediately preceding this date.
  const oldestLoadedRef = useRef<Date | null>(null)

  // Empty array → undefined so the API client doesn't append `programIds=`
  // (the empty-selection contract is "all programs").
  const programIds = selectedProgramIds.length ? selectedProgramIds : undefined

  // Mount the picker as the right-side header element. Re-running on every
  // navigation change is fine — setOptions is idempotent.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <ProgramFilterPicker />,
    })
  }, [navigation])

  const loadInitial = useCallback(async (silent = false) => {
    if (!activeGym) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const end = startOfDay(new Date())
      const start = addDays(end, -(INITIAL_DAYS - 1))
      const workouts = await api.gyms.workouts(
        activeGym.id,
        start.toISOString(),
        addDays(end, 1).toISOString(),
        programIds,
      )
      const blocks = buildDayBlocks(workouts, start, end)
      setDayBlocks(blocks)
      oldestLoadedRef.current = start
    } catch {
      setError('Could not load workouts. Pull to refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeGym, programIds])

  const loadMoreOlder = useCallback(async () => {
    if (!activeGym || !oldestLoadedRef.current || loadingMore) return
    setLoadingMore(true)
    try {
      const end = addDays(oldestLoadedRef.current, -1)
      const start = addDays(end, -(PAGE_DAYS - 1))
      const workouts = await api.gyms.workouts(
        activeGym.id,
        start.toISOString(),
        addDays(end, 1).toISOString(),
        programIds,
      )
      const newBlocks = buildDayBlocks(workouts, start, end)
      setDayBlocks((prev) => [...prev, ...newBlocks])
      oldestLoadedRef.current = start
    } catch {
      // Silent: pagination errors don't block the rest of the feed.
      // The user can pull-to-refresh to retry.
    } finally {
      setLoadingMore(false)
    }
  }, [activeGym, loadingMore, programIds])

  useFocusEffect(useCallback(() => { loadInitial() }, [loadInitial]))

  function handleRefresh() {
    setRefreshing(true)
    loadInitial(true)
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
      onEndReached={loadMoreOlder}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error ?? 'No workouts to show.'}</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footerLoading}>
            <ActivityIndicator color="#818cf8" />
          </View>
        ) : null
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
  emptyDay: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  emptyDayText: {
    color: '#4b5563',
    fontSize: 13,
    fontStyle: 'italic',
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
    minWidth: 38,
    paddingHorizontal: 6,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeAbbr: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
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
  footerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
})
