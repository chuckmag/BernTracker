import { useCallback, useState } from 'react'
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation, type CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import type { HistoryStackParamList, MainTabParamList, RootStackParamList } from '../../App'
import { api, type ResultHistoryItem } from '../lib/api'
import { formatResultValue, monthKey, shortDate } from '../lib/format'
import { styleFor } from '../lib/workoutTypeStyles'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = CompositeScreenProps<
  StackScreenProps<HistoryStackParamList, 'History'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, 'HistoryTab'>,
    StackScreenProps<RootStackParamList>
  >
>

type RootNav = StackNavigationProp<RootStackParamList>

interface MonthBlock {
  month: string
  results: ResultHistoryItem[]
}

function groupByMonth(results: ResultHistoryItem[]): MonthBlock[] {
  const byMonth: Record<string, ResultHistoryItem[]> = {}
  const order: string[] = []
  for (const r of results) {
    const key = monthKey(r.workout.scheduledAt)
    if (!byMonth[key]) {
      byMonth[key] = []
      order.push(key)
    }
    byMonth[key].push(r)
  }
  return order.map((month) => ({ month, results: byMonth[month] }))
}

function ResultRow({ item, onPress }: { item: ResultHistoryItem; onPress: () => void }) {
  const ts = styleFor(item.workout.type)
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <ThemedView variant="card" style={styles.row}>
        <View style={styles.rowLeft}>
          <View style={[styles.typeBadge, { backgroundColor: ts.bgTint }]}>
            <ThemedText style={[styles.typeAbbr, { color: ts.tint }]}>{ts.abbr}</ThemedText>
          </View>
          <View style={styles.rowBody}>
            <ThemedText style={styles.rowTitle} numberOfLines={1}>{item.workout.title}</ThemedText>
            <ThemedText variant="tertiary" style={styles.rowMeta}>
              {shortDate(item.workout.scheduledAt)} · {item.level.replace('_', '+')}
            </ThemedText>
          </View>
        </View>
        <ThemedText variant="secondary" style={styles.rowValue}>{formatResultValue(item.value)}</ThemedText>
      </ThemedView>
    </TouchableOpacity>
  )
}

function MonthBlockItem({ block, onRowPress }: { block: MonthBlock; onRowPress: (item: ResultHistoryItem) => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.monthBlock}>
      <ThemedText variant="tertiary" style={styles.monthHeader}>{block.month.toUpperCase()}</ThemedText>
      <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
      {block.results.map((r) => (
        <ResultRow key={r.id} item={r} onPress={() => onRowPress(r)} />
      ))}
    </View>
  )
}

export default function HistoryScreen(_props: Props) {
  const { colors } = useTheme()
  const navigation = useNavigation<RootNav>()
  const [blocks, setBlocks] = useState<MonthBlock[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (targetPage: number, silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await api.me.results(targetPage)
      setBlocks(groupByMonth(data.results))
      setPage(data.page)
      setPages(data.pages)
    } catch {
      setError('Could not load your history. Pull to refresh.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load(page) }, [load, page]))

  function handleRefresh() {
    setRefreshing(true)
    load(page, true)
  }

  function handleRowPress(item: ResultHistoryItem) {
    navigation.navigate('WodDetail', { workoutId: item.workout.id, from: 'history' })
  }

  if (loading) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  return (
    <ThemedView variant="screen" style={styles.container}>
      <FlatList
        contentContainerStyle={blocks.length === 0 ? styles.centerContent : styles.listContent}
        data={blocks}
        keyExtractor={(b) => b.month}
        renderItem={({ item }) => <MonthBlockItem block={item} onRowPress={handleRowPress} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <ThemedText variant="tertiary" style={styles.emptyTitle}>No results yet.</ThemedText>
            <ThemedText variant="tertiary" style={styles.emptyBody}>Log your first result on a workout to start your history.</ThemedText>
            {error && <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>}
          </View>
        }
        ListFooterComponent={
          pages > 1 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[
                  styles.pageBtn,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  page <= 1 && styles.pageBtnDisabled,
                ]}
                disabled={page <= 1}
                onPress={() => load(page - 1)}
              >
                <ThemedText variant="secondary" style={styles.pageBtnText}>Prev</ThemedText>
              </TouchableOpacity>
              <ThemedText variant="tertiary" style={styles.pageMeta}>Page {page} of {pages}</ThemedText>
              <TouchableOpacity
                style={[
                  styles.pageBtn,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  page >= pages && styles.pageBtnDisabled,
                ]}
                disabled={page >= pages}
                onPress={() => load(page + 1)}
              >
                <ThemedText variant="secondary" style={styles.pageBtnText}>Next</ThemedText>
              </TouchableOpacity>
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      />
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: 16 },
  centerContent: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  monthBlock: { marginHorizontal: 16, marginBottom: 24 },
  monthHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  divider: { height: 1, marginBottom: 8 },
  row: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  typeBadge: {
    minWidth: 38,
    paddingHorizontal: 6,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeAbbr: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  rowMeta: { fontSize: 12 },
  rowValue: { fontSize: 14, fontWeight: '600', marginLeft: 8 },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  pageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, fontWeight: '500' },
  pageMeta: { fontSize: 13 },
})
