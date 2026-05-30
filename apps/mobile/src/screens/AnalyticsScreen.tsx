import { useCallback, useEffect, useState } from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { AnalyticsStackParamList } from '../../App'
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
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
    >
      <ThemedView variant="card" style={[s.movementCard, { borderColor: colors.borderSubtle }]}>
        <View style={s.movementCardLeft}>
          <ThemedText style={s.movementName}>{entry.name}</ThemedText>
          <ThemedText variant="tertiary" style={s.movementPr}>
            {entry.primaryPR ? formatPR(entry.primaryPR) : 'No PR recorded'}
          </ThemedText>
        </View>
        <View style={s.movementCardRight}>
          <ThemedText variant="tertiary" style={s.movementDate}>{formatDate(entry.lastLoggedAt)}</ThemedText>
          <ThemedText variant="muted" style={s.movementChevron}>›</ThemedText>
        </View>
      </ThemedView>
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
      <ThemedText variant="muted" style={s.groupLabel}>{GROUP_LABELS[group]}</ThemedText>
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
  const { colors } = useTheme()
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (error) {
    return <ThemedText style={[s.error, { color: colors.errorText }]}>{error}</ThemedText>
  }

  if (!data || (!data.strength.length && !data.monostructural.length && !data.gymnastics.length)) {
    return (
      <View style={s.emptyState}>
        <ThemedText variant="tertiary" style={s.emptyTitle}>No movements logged yet</ThemedText>
        <ThemedText variant="tertiary" style={s.emptyBody}>
          Your logged movements will appear here once you start tracking workouts.
        </ThemedText>
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
  const { colors } = useTheme()
  const scoreText = formatBenchmarkScore(entry)
  const attempted = entry.latestResult !== null || entry.manualResultCount > 0

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={entry.name}
    >
      <ThemedView variant="card" style={[s.movementCard, { borderColor: colors.borderSubtle }]}>
        <View style={s.movementCardLeft}>
          <ThemedText style={s.movementName}>{entry.name}</ThemedText>
          <ThemedText variant={attempted ? 'tertiary' : 'muted'} style={s.movementPr}>{scoreText}</ThemedText>
        </View>
        <View style={s.movementCardRight}>
          {entry.latestResult && (
            <ThemedText variant="tertiary" style={s.movementDate}>{formatDate(entry.latestResult.achievedAt)}</ThemedText>
          )}
          <ThemedText variant="muted" style={s.movementChevron}>›</ThemedText>
        </View>
      </ThemedView>
    </TouchableOpacity>
  )
}

// ── Benchmarks tab content ────────────────────────────────────────────────────

interface BenchmarksContentProps {
  loading: boolean
  error: string | null
  data: BenchmarkSummaryEntry[] | null
  navigation: AnalyticsNav
  activeCategory: WorkoutCategory
  onChangeCategory: (cat: WorkoutCategory) => void
}

function BenchmarksContent({ loading, error, data, navigation, activeCategory, onChangeCategory }: BenchmarksContentProps) {
  const { colors } = useTheme()
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (error) {
    return <ThemedText style={[s.error, { color: colors.errorText }]}>{error}</ThemedText>
  }

  if (!data || data.length === 0) {
    return (
      <View style={s.emptyState}>
        <ThemedText variant="tertiary" style={s.emptyTitle}>No benchmarks available</ThemedText>
        <ThemedText variant="tertiary" style={s.emptyBody}>Benchmark WODs will appear here once they are added to the library.</ThemedText>
      </View>
    )
  }

  // Group + sort: attempted first, then alphabetical within each category
  const grouped = new Map<WorkoutCategory, BenchmarkSummaryEntry[]>()
  for (const cat of BENCHMARK_CATEGORY_ORDER) grouped.set(cat, [])
  for (const e of data) {
    const arr = grouped.get(e.category)
    if (arr) arr.push(e)
  }
  for (const [cat, entries] of grouped) {
    grouped.set(cat, entries.sort((a, b) => {
      const aAttempted = a.latestResult !== null || a.manualResultCount > 0
      const bAttempted = b.latestResult !== null || b.manualResultCount > 0
      if (aAttempted !== bAttempted) return aAttempted ? -1 : 1
      return a.name.localeCompare(b.name)
    }))
  }

  const activeEntries = grouped.get(activeCategory) ?? []

  return (
    <View style={s.benchmarksContainer}>
      {/* Category tab strip — horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryTabStrip}
        accessibilityRole="tablist"
      >
        {BENCHMARK_CATEGORY_ORDER.map((cat) => {
          const isActive = cat === activeCategory
          const count = grouped.get(cat)?.length ?? 0
          return (
            <TouchableOpacity
              key={cat}
              style={[
                s.categoryTab,
                { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle },
                isActive && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => onChangeCategory(cat)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={BENCHMARK_CATEGORY_LABELS[cat]}
            >
              <ThemedText
                variant={isActive ? undefined : 'tertiary'}
                style={[
                  s.categoryTabText,
                  isActive && { color: colors.onPrimary, fontWeight: '600' },
                ]}
              >
                {BENCHMARK_CATEGORY_LABELS[cat]}
              </ThemedText>
              {count > 0 && (
                <View
                  style={[
                    s.categoryCount,
                    { backgroundColor: colors.borderSubtle },
                    isActive && { backgroundColor: 'rgba(255,255,255,0.18)' },
                  ]}
                >
                  <ThemedText
                    variant={isActive ? undefined : 'tertiary'}
                    style={[
                      s.categoryCountText,
                      isActive && { color: colors.onPrimary },
                    ]}
                  >
                    {count}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Active category entries */}
      {activeEntries.length === 0 ? (
        <ThemedText variant="tertiary" style={s.emptyTabText}>
          No benchmarks in {BENCHMARK_CATEGORY_LABELS[activeCategory]}.
        </ThemedText>
      ) : (
        <View style={s.groupSection}>
          {activeEntries.map((e) => (
            <BenchmarkCard
              key={e.id}
              entry={e}
              onPress={() => navigation.push('BenchmarkDetail', { entry: e })}
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { colors } = useTheme()
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
  const [benchmarkCategory, setBenchmarkCategory] = useState<WorkoutCategory>('GIRL_WOD')

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
    <ThemedView variant="screen" style={s.container}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
      {/* Tab strip */}
      <ThemedView variant="card" style={s.tabStrip} accessibilityRole="tablist">
        {(['summary', 'movements', 'benchmarks'] as AnalyticsTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && { backgroundColor: colors.borderSubtle }]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={TAB_LABELS[t]}
          >
            <ThemedText
              variant={tab === t ? undefined : 'tertiary'}
              style={[s.tabText, tab === t && s.tabTextActive]}
            >
              {TAB_LABELS[t]}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>

      {/* Tab content */}
      {tab === 'summary' && (
        <>
          {summaryLoading && (
            <View style={s.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          {!summaryLoading && summaryError && (
            <ThemedText style={[s.error, { color: colors.errorText }]}>{summaryError}</ThemedText>
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
          activeCategory={benchmarkCategory}
          onChangeCategory={setBenchmarkCategory}
        />
      )}
      </ScrollView>
    </ThemedView>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 14,
  },

  // Tab strip
  tabStrip: {
    flexDirection: 'row',
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
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '600',
  },

  // Movements & benchmarks (shared card style)
  movementsContainer: {
    gap: 24,
  },
  benchmarksContainer: {
    gap: 12,
  },

  // Benchmark category tab strip
  categoryTabStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  categoryCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyTabText: {
    fontSize: 13,
    paddingVertical: 24,
    textAlign: 'center',
  },
  groupSection: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
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
  },
  movementPr: {
    fontSize: 12,
  },
  movementDate: {
    fontSize: 11,
  },
  movementChevron: {
    fontSize: 16,
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
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
})
