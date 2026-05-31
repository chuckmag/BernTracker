import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { CalendarStackParamList, MainTabParamList, RootStackParamList } from '../../App'
import { api, type PersonalProgram, type Workout } from '../lib/api'
import { useGym } from '../context/GymContext'
import { useProgramFilter } from '../context/ProgramFilterContext'
import ProgramFilterPicker from '../components/ProgramFilterPicker'
import { useTheme, type ThemeColors } from '../lib/theme'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = CompositeScreenProps<
  StackScreenProps<CalendarStackParamList, 'Calendar'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, 'CalendarTab'>,
    StackScreenProps<RootStackParamList>
  >
>

// Width of the strip view in days. Mirrors the web's CalendarDayStrip
// (apps/web/src/components/WorkoutCalendarBoard.tsx) so a member switching
// between the mweb calendar and the Expo app sees the same window shape.
const STRIP_DAYS = 3

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatRangeLabel(days: Date[]): string {
  if (days.length === 0) return ''
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const first = days[0].toLocaleDateString('default', fmt)
  if (days.length === 1) return first
  const last = days[days.length - 1].toLocaleDateString('default', fmt)
  return `${first} – ${last}`
}

export default function CalendarScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const { activeGym } = useGym()
  const { selected: selectedProgramIds } = useProgramFilter()

  // Tracks the start date of the visible window. Kept as a YYYY-MM-DD key
  // rather than a Date so prev/next can't drift it by anything other than
  // ±STRIP_DAYS.
  const [stripStartKey, setStripStartKey] = useState(() => toDateKey(startOfDay(new Date())))
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Personal program upsert — drives the "+" tap target for new workouts.
  // Failure is non-fatal; the "+" stays hidden if the upsert never lands.
  const [personalProgram, setPersonalProgram] = useState<PersonalProgram | null>(null)

  const programIds = selectedProgramIds.length ? selectedProgramIds : undefined

  useEffect(() => {
    navigation.setOptions({ headerRight: () => <ProgramFilterPicker /> })
  }, [navigation])

  useEffect(() => {
    let cancelled = false
    api.me.personalProgram.get()
      .then((p) => { if (!cancelled) setPersonalProgram(p) })
      .catch(() => { /* non-fatal — "+" stays hidden */ })
    return () => { cancelled = true }
  }, [])

  const visibleDays = useMemo(() => {
    const start = new Date(stripStartKey + 'T00:00:00')
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(start, i))
  }, [stripStartKey])

  const loadStrip = useCallback(async (silent = false) => {
    if (!activeGym) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      // UTC bounds, not local. The server stores `scheduledAt` at a UTC
      // moment for the named calendar date (e.g. midnight or noon UTC);
      // converting local-midnight to ISO shifts the lower bound forward by
      // the local UTC offset, which drops workouts whose UTC moment falls
      // before that. For a PST viewer, "local midnight 5/28" = 5/28 07:00Z,
      // so a 5/28 00:00Z workout would be missed.
      const stripStart = new Date(`${stripStartKey}T00:00:00.000Z`)
      const stripEnd = addDays(stripStart, STRIP_DAYS - 1)
      stripEnd.setUTCHours(23, 59, 59, 999)
      const data = await api.gyms.workouts(
        activeGym.id,
        stripStart.toISOString(),
        stripEnd.toISOString(),
        programIds,
      )
      setWorkouts(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workouts.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeGym, stripStartKey, programIds])

  // useFocusEffect re-runs on every focus return so workouts created via
  // the editor show up without a manual refresh.
  useFocusEffect(useCallback(() => { loadStrip() }, [loadStrip]))

  // Bucket by the workout's UTC scheduled date (matches web's
  // WorkoutCalendarBoard) so an evening WOD doesn't shift onto the next
  // day for users east of the gym timezone.
  const workoutsByDate = useMemo(() => {
    const map: Record<string, Workout[]> = {}
    for (const w of workouts) {
      if (w.status !== 'PUBLISHED') continue
      const key = w.scheduledAt.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(w)
    }
    return map
  }, [workouts])

  const today = useMemo(() => new Date(), [])
  const todayKey = toDateKey(startOfDay(today))
  const isTodayVisible = visibleDays.some((d) => toDateKey(d) === todayKey)

  function stepStrip(dir: -1 | 1) {
    const start = new Date(stripStartKey + 'T00:00:00')
    setStripStartKey(toDateKey(addDays(start, dir * STRIP_DAYS)))
  }

  function jumpToToday() {
    setStripStartKey(toDateKey(startOfDay(new Date())))
  }

  function handleRefresh() {
    setRefreshing(true)
    loadStrip(true)
  }

  function onAddPress(dateKey: string) {
    navigation.navigate('WorkoutEditor', { mode: 'create', scheduledAt: dateKey })
  }

  function onWorkoutPress(workout: Workout) {
    navigation.navigate('WodDetail', { workoutId: workout.id })
  }

  if (!activeGym) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ThemedText variant="tertiary" style={styles.emptyText}>No gym selected.</ThemedText>
      </ThemedView>
    )
  }

  return (
    <ThemedView variant="screen" style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Nav row — prev / range label / next. Today jump appears in the
            left cell only when today is outside the visible window. */}
        <View style={styles.navRow}>
          <View style={styles.navLeft}>
            <NavButton onPress={() => stepStrip(-1)} colors={colors} testID="strip-prev" label="Previous days">←</NavButton>
            {!isTodayVisible && (
              <TouchableOpacity
                onPress={jumpToToday}
                style={[styles.todayBtn, { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive }]}
                accessibilityRole="button"
                accessibilityLabel="Jump to today"
                testID="strip-today"
              >
                <ThemedText variant="secondary" style={styles.todayBtnText}>Today</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          <ThemedText variant="secondary" style={styles.rangeLabel} numberOfLines={1}>
            {formatRangeLabel(visibleDays)}
          </ThemedText>
          <View style={styles.navRight}>
            <NavButton onPress={() => stepStrip(1)} colors={colors} testID="strip-next" label="Next days">→</NavButton>
          </View>
        </View>

        {error && (
          <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error}</ThemedText>
        )}

        {loading && workouts.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.stripGrid, loading && styles.dimmedDuringRefetch]} testID="calendar-day-strip">
            {visibleDays.map((date) => {
              const key = toDateKey(date)
              return (
                <DayColumn
                  key={key}
                  date={date}
                  dateKey={key}
                  isToday={key === todayKey}
                  workouts={workoutsByDate[key] ?? []}
                  colors={colors}
                  onAddPress={personalProgram ? () => onAddPress(key) : null}
                  onWorkoutPress={onWorkoutPress}
                />
              )
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  )
}

function NavButton({
  onPress,
  colors,
  testID,
  label,
  children,
}: {
  onPress: () => void
  colors: ThemeColors
  testID: string
  label: string
  children: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.navBtn, { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <ThemedText variant="secondary" style={styles.navBtnText}>{children}</ThemedText>
    </TouchableOpacity>
  )
}

interface DayColumnProps {
  date: Date
  dateKey: string
  isToday: boolean
  workouts: Workout[]
  colors: ThemeColors
  onAddPress: (() => void) | null
  onWorkoutPress: (workout: Workout) => void
}

function DayColumn({ date, dateKey, isToday, workouts, colors, onAddPress, onWorkoutPress }: DayColumnProps) {
  return (
    <ThemedView
      variant="card"
      style={[styles.dayColumn, { borderColor: colors.borderSubtle }]}
      testID={`calendar-day-${dateKey}`}
    >
      <View style={styles.dayHeader}>
        <View style={styles.dayHeaderText}>
          <ThemedText variant="tertiary" style={styles.dayName}>
            {DAY_LABELS[date.getDay()]}
          </ThemedText>
          <View
            style={[
              styles.dateBubble,
              isToday && { backgroundColor: colors.primary },
            ]}
          >
            <ThemedText
              style={[
                styles.dateNumber,
                isToday && { color: colors.onPrimary, fontWeight: '700' },
              ]}
            >
              {date.getDate()}
            </ThemedText>
          </View>
        </View>
        {onAddPress && (
          <TouchableOpacity
            onPress={onAddPress}
            accessibilityRole="button"
            accessibilityLabel={`Add workout on ${dateKey}`}
            style={styles.addBtn}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            testID={`calendar-add-${dateKey}`}
          >
            <ThemedText variant="tertiary" style={styles.addBtnText}>+</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.workoutList}>
        {workouts.length === 0 ? (
          <ThemedText variant="muted" style={styles.emptyPill}>—</ThemedText>
        ) : (
          workouts.map((w) => {
            const ts = WORKOUT_TYPE_STYLES[w.type]
            return (
              <TouchableOpacity
                key={w.id}
                onPress={() => onWorkoutPress(w)}
                style={[
                  styles.workoutPill,
                  { backgroundColor: colors.surfaceSubtle, borderLeftColor: ts.tint },
                ]}
                testID={`calendar-workout-${w.id}`}
                accessibilityRole="button"
                accessibilityLabel={w.title}
              >
                <ThemedText style={[styles.workoutAbbr, { color: ts.tint }]}>{ts.abbr}</ThemedText>
                <ThemedText style={styles.workoutTitle} numberOfLines={1}>{w.title}</ThemedText>
              </TouchableOpacity>
            )
          })
        )}
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 12,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  dimmedDuringRefetch: {
    opacity: 0.6,
  },

  // Nav row — three-cell flex row. Left and right cells claim equal flex so
  // the range label stays geometrically centered regardless of whether the
  // "Today" button is mounted.
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  navLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rangeLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  navBtn: {
    minWidth: 36,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  todayBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // 3-column day strip — mirrors web's CalendarDayStrip grid.
  stripGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  dayColumn: {
    flex: 1,
    minHeight: 180,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayHeaderText: {
    alignItems: 'center',
    gap: 2,
  },
  dayName: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dateBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  addBtnText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '500',
  },
  workoutList: {
    flex: 1,
    gap: 4,
  },
  emptyPill: {
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 8,
  },
  workoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 4,
    borderLeftWidth: 2,
    minHeight: 28,
  },
  workoutAbbr: {
    fontSize: 9,
    fontWeight: '700',
    minWidth: 18,
  },
  workoutTitle: {
    fontSize: 11,
    flex: 1,
  },
})
