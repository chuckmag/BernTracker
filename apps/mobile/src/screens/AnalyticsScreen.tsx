import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { AnalyticsStackParamList } from '../../../App'
import {
  api,
  type ConsistencyData,
  type TrackedMovement,
  type MovementsAnalyticsData,
  type MovementSummaryEntry,
  type MovementDisplayGroup,
  type MovementPrimaryPR,
  type MovementPrType,
  type BenchmarkSummaryEntry,
} from '../lib/api'
import type { WorkoutCategory } from '@wodalytics/types'
import ConsistencyCard from '../components/ConsistencyCard'
import StrengthPRCard from '../components/StrengthPRCard'

type AnalyticsTab = 'summary' | 'movements' | 'benchmarks'
type AnalyticsNav = StackNavigationProp<AnalyticsStackParamList, 'Analytics'>

const TAB_LABELS: Record<AnalyticsTab, string> = {
  summary: 'Summary',
  movements: 'Movements',
  benchmarks: 'Benchmarks',
}

const GROUP_LABELS: Record<MovementDisplayGroup, string> = {
  strength: 'Strength',
  monostructural: 'Monostructural',
  gymnastics: 'Gymnastics',
}

const BENCHMARK_CATEGORY_ORDER: WorkoutCategory[] = [
  'GIRL_WOD', 'HERO_WOD', 'OPEN_WOD', 'GAMES_WOD', 'BENCHMARK',
]

const BENCHMARK_CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girls',
  HERO_WOD: 'Heroes',
  OPEN_WOD: 'Open',
  GAMES_WOD: 'Games',
  BENCHMARK: 'Benchmarks',
}

function formatPR(pr: MovementPrimaryPR): string {
  switch (pr.type) {
    case 'LOAD':
      return `${pr.load} ${pr.loadUnit} × ${pr.reps}`
    case 'MAX_REPS':
      return `${pr.maxReps} reps`
    case 'TIME': {
      const m = Math.floor(pr.seconds / 60)
      const s = pr.seconds % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }
    case 'DISTANCE':
      return `${pr.distance} ${pr.distanceUnit}`
    case 'CALORIES':
      return `${pr.calories} cal`
  }
}

function formatBenchmarkScore(entry: BenchmarkSummaryEntry): string {
  const r = entry.latestResult
  if (!r) return 'Not attempted'
  const { primaryScoreKind: kind, primaryScoreValue: val } = r
  if (kind == null || val == null) return 'Logged'
  switch (kind) {
    case 'TIME': {
      const m = Math.floor(val / 60)
      const s = val % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }
    case 'ROUNDS_REPS': {
      const rounds = Math.floor(val / 1000)
      const reps = val % 1000
      return reps > 0 ? `${rounds}+${reps}` : `${rounds} rounds`
    }
    case 'LOAD': return `${val} lb`
    case 'REPS': return `${val} reps`
    case 'CALORIES': return `${val} cal`
    default: return String(val)
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ── Movement card ─────────────────────────────────────────────────────────────

interface MovementCardProps {
  entry: MovementSummaryEntry
  onPress: () => void
}

function MovementCard({ entry, onPress }: MovementCardProps) {
  return (
    <TouchableOpacity
      style={s.movementCard}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
    >
      <View style={s.movementCardLeft}>
        <Text style={s.movementName}>{entry.name}</Text>
        <Text style={s.movementPr}>
          {entry.primaryPR ? formatPR(entry.primaryPR) : 'No PR recorded'}
        </Text>
      </View>
      <View style={s.movementCardRight}>
        <Text style={s.movementDate}>{formatDate(entry.lastLoggedAt)}</Text>
        <Text style={s.movementChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Group section ──────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: MovementDisplayGroup
  entries: MovementSummaryEntry[]
  navigation: AnalyticsNav
}

function GroupSection({ group, entries, navigation }: GroupSectionProps) {
  if (entries.length === 0) return null
  return (
    <View style={s.groupSection}>
      <Text style={s.groupLabel}>{GROUP_LABELS[group]}</Text>
      {entries.map((e) => (
        <MovementCard
          key={e.movementId}
          entry={e}
          onPress={() => navigation.push('MovementDetail', {
            movementId: e.movementId,
            name: e.name,
            prTypes: e.prTypes,
          })}
        />
      ))}
    </View>
  )
}

// ── Movements tab content ──────────────────────────────────────────────────────

interface MovementsContentProps {
  loading: boolean
  error: string | null
  data: MovementsAnalyticsData | null
  navigation: AnalyticsNav
}

function MovementsContent({ loading, error, data, navigation }: MovementsContentProps) {
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error) {
    return <Text style={s.error}>{error}</Text>
  }

  if (!data || (!data.strength.length && !data.monostructural.length && !data.gymnastics.length)) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyTitle}>No movements logged yet</Text>
        <Text style={s.emptyBody}>
          Your logged movements will appear here once you start tracking workouts.
        </Text>
      </View>
    )
  }

  return (
    <View style={s.movementsContainer}>
      {(['strength', 'monostructural', 'gymnastics'] as MovementDisplayGroup[]).map((g) => (
        <GroupSection key={g} group={g} entries={data[g]} navigation={navigation} />
      ))}
    </View>
  )
}

// ── Benchmark card ────────────────────────────────────────────────────────────

interface BenchmarkCardProps {
  entry: BenchmarkSummaryEntry
  onPress: () => void
}

function BenchmarkCard({ entry, onPress }: BenchmarkCardProps) {
  const scoreText = formatBenchmarkScore(entry)
  const attempted = entry.latestResult !== null || entry.manualResultCount > 0

  return (
    <TouchableOpacity
      style={s.movementCard}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
    >
      <View style={s.movementCardLeft}>
        <Text style={s.movementName}>{entry.name}</Text>
        <Text style={[s.movementPr, !attempted && s.notAttempted]}>{scoreText}</Text>
      </View>
      <View style={s.movementCardRight}>
        {entry.latestResult && (
          <Text style={s.movementDate}>{formatDate(entry.latestResult.achievedAt)}</Text>
        )}
        <Text style={s.movementChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

// ── Benchmarks tab content ────────────────────────────────────────────────────

interface BenchmarksContentProps {
  loading: boolean
  error: string | null
  data: BenchmarkSummaryEntry[] | null
  navigation: AnalyticsNav
}

function BenchmarksContent({ loading, error, data, navigation }: BenchmarksContentProps) {
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error) {
    return <Text style={s.error}>{error}</Text>
  }

  if (!data || data.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={s.emptyTitle}>No benchmarks available</Text>
        <Text style={s.emptyBody}>Benchmark WODs will appear here once they are added to the library.</Text>
      </View>
    )
  }

  const grouped = new Map<WorkoutCategory, BenchmarkSummaryEntry[]>()
  for (const e of data) {
    const arr = grouped.get(e.category) ?? []
    arr.push(e)
    grouped.set(e.category, arr)
  }

  // Sort each category: attempted first, then alphabetical
  for (const [cat, entries] of grouped) {
    grouped.set(cat, entries.sort((a, b) => {
      const aAttempted = a.latestResult !== null || a.manualResultCount > 0
      const bAttempted = b.latestResult !== null || b.manualResultCount > 0
      if (aAttempted !== bAttempted) return aAttempted ? -1 : 1
      return a.name.localeCompare(b.name)
    }))
  }

  return (
    <View style={s.movementsContainer}>
      {BENCHMARK_CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
        <View key={cat} style={s.groupSection}>
          <Text style={s.groupLabel}>{BENCHMARK_CATEGORY_LABELS[cat]}</Text>
          {grouped.get(cat)!.map((e) => (
            <BenchmarkCard
              key={e.id}
              entry={e}
              onPress={() => navigation.push('BenchmarkDetail', { entry: e })}
            />
          ))}
        </View>
      ))}
    </View>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const navigation = useNavigation<AnalyticsNav>()
  const [tab, setTab] = useState<AnalyticsTab>('summary')

  // Summary tab state
  const [consistency, setConsistency] = useState<ConsistencyData | null>(null)
  const [trackedMovements, setTrackedMovements] = useState<TrackedMovement[] | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryRefreshing, setSummaryRefreshing] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // Movements tab state
  const [movementsData, setMovementsData] = useState<MovementsAnalyticsData | null>(null)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementsRefreshing, setMovementsRefreshing] = useState(false)
  const [movementsError, setMovementsError] = useState<string | null>(null)
  const [movementsFetched, setMovementsFetched] = useState(false)

  // Benchmarks tab state
  const [benchmarksData, setBenchmarksData] = useState<BenchmarkSummaryEntry[] | null>(null)
  const [benchmarksLoading, setBenchmarksLoading] = useState(false)
  const [benchmarksRefreshing, setBenchmarksRefreshing] = useState(false)
  const [benchmarksError, setBenchmarksError] = useState<string | null>(null)
  const [benchmarksFetched, setBenchmarksFetched] = useState(false)

  async function fetchSummary() {
    setSummaryError(null)
    try {
      const [c, m] = await Promise.all([
        api.analytics.consistency(12),
        api.analytics.trackedMovements(),
      ])
      setConsistency(c)
      setTrackedMovements(m)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : 'Failed to load analytics')
    }
  }

  async function fetchMovements() {
    setMovementsError(null)
    try {
      const data = await api.analytics.movements()
      setMovementsData(data)
      setMovementsFetched(true)
    } catch (e) {
      setMovementsError(e instanceof Error ? e.message : 'Failed to load movements')
    }
  }

  async function fetchBenchmarks() {
    setBenchmarksError(null)
    try {
      const data = await api.benchmarks.list()
      setBenchmarksData(data)
      setBenchmarksFetched(true)
    } catch (e) {
      setBenchmarksError(e instanceof Error ? e.message : 'Failed to load benchmarks')
    }
  }

  useFocusEffect(
    useCallback(() => {
      setSummaryLoading(true)
      fetchSummary().finally(() => setSummaryLoading(false))
    }, []),
  )

  useEffect(() => {
    if (tab === 'movements' && !movementsFetched && !movementsLoading) {
      setMovementsLoading(true)
      fetchMovements().finally(() => setMovementsLoading(false))
    }
    if (tab === 'benchmarks' && !benchmarksFetched && !benchmarksLoading) {
      setBenchmarksLoading(true)
      fetchBenchmarks().finally(() => setBenchmarksLoading(false))
    }
  }, [tab])

  async function handleRefresh() {
    if (tab === 'summary') {
      setSummaryRefreshing(true)
      await fetchSummary()
      setSummaryRefreshing(false)
    } else if (tab === 'movements') {
      setMovementsRefreshing(true)
      await fetchMovements()
      setMovementsRefreshing(false)
    } else if (tab === 'benchmarks') {
      setBenchmarksRefreshing(true)
      await fetchBenchmarks()
      setBenchmarksRefreshing(false)
    }
  }

  const isRefreshing =
    tab === 'summary' ? summaryRefreshing :
    tab === 'movements' ? movementsRefreshing :
    benchmarksRefreshing

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#818cf8" />}
    >
      {/* Tab strip */}
      <View style={s.tabStrip} accessibilityRole="tablist">
        {(['summary', 'movements', 'benchmarks'] as AnalyticsTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={TAB_LABELS[t]}
          >
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {tab === 'summary' && (
        <>
          {summaryLoading && (
            <View style={s.center}>
              <ActivityIndicator color="#818cf8" />
            </View>
          )}
          {!summaryLoading && summaryError && (
            <Text style={s.error}>{summaryError}</Text>
          )}
          {!summaryLoading && !summaryError && (
            <>
              {trackedMovements && trackedMovements.length > 0 && (
                <StrengthPRCard movements={trackedMovements} />
              )}
              {consistency && <ConsistencyCard data={consistency} weeks={12} />}
            </>
          )}
        </>
      )}

      {tab === 'movements' && (
        <MovementsContent
          loading={movementsLoading}
          error={movementsError}
          data={movementsData}
          navigation={navigation}
        />
      )}

      {tab === 'benchmarks' && (
        <BenchmarksContent
          loading={benchmarksLoading}
          error={benchmarksError}
          data={benchmarksData}
          navigation={navigation}
        />
      )}
    </ScrollView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
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
    color: '#f87171',
    fontSize: 14,
  },

  // Tab strip
  tabStrip: {
    flexDirection: 'row',
    backgroundColor: '#111827',
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
  tabActive: {
    backgroundColor: '#1f2937',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // Movements & benchmarks (shared card style)
  movementsContainer: {
    gap: 24,
  },
  groupSection: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  movementCardLeft: {
    flex: 1,
    gap: 3,
  },
  movementCardRight: {
    marginLeft: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  movementName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f9fafb',
  },
  movementPr: {
    fontSize: 12,
    color: '#9ca3af',
  },
  notAttempted: {
    color: '#4b5563',
  },
  movementDate: {
    fontSize: 11,
    color: '#6b7280',
  },
  movementChevron: {
    fontSize: 16,
    color: '#4b5563',
  },

  // Empty state
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  emptyBody: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
})
