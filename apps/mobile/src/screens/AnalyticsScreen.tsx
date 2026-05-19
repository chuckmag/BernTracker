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
} from '../lib/api'
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
    }
  }

  const isRefreshing = tab === 'summary' ? summaryRefreshing : (tab === 'movements' ? movementsRefreshing : false)

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
        <View style={s.benchmarksPlaceholder}>
          <Text style={s.benchmarksText}>Benchmark WODs coming soon.</Text>
          <Text style={s.benchmarksSub}>Tracked in #370.</Text>
        </View>
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

  // Movements
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

  // Benchmarks
  benchmarksPlaceholder: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 6,
  },
  benchmarksText: {
    fontSize: 14,
    color: '#6b7280',
  },
  benchmarksSub: {
    fontSize: 12,
    color: '#4b5563',
  },
})
