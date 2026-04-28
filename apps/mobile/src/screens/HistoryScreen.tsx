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
import { useFocusEffect, useNavigation, type CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import type { MainTabParamList, RootStackParamList } from '../../App'
import { api, type ResultHistoryItem } from '../lib/api'
import { formatResultValue, monthKey, shortDate, workoutTypeAbbr } from '../lib/format'

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'HistoryTab'>,
  StackScreenProps<RootStackParamList>
>

type RootNav = StackNavigationProp<RootStackParamList>

interface MonthBlock {
  month: string
  results: ResultHistoryItem[]
}

const PAGE_SIZE = 20

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
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeAbbr}>{workoutTypeAbbr(item.workout.type)}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.workout.title}</Text>
          <Text style={styles.rowMeta}>{shortDate(item.workout.scheduledAt)} · {item.level.replace('_', '+')}</Text>
        </View>
      </View>
      <Text style={styles.rowValue}>{formatResultValue(item.value)}</Text>
    </TouchableOpacity>
  )
}

function MonthBlockItem({ block, onRowPress }: { block: MonthBlock; onRowPress: (item: ResultHistoryItem) => void }) {
  return (
    <View style={styles.monthBlock}>
      <Text style={styles.monthHeader}>{block.month.toUpperCase()}</Text>
      <View style={styles.divider} />
      {block.results.map((r) => (
        <ResultRow key={r.id} item={r} onPress={() => onRowPress(r)} />
      ))}
    </View>
  )
}

export default function HistoryScreen(_props: Props) {
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
      <View style={styles.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={blocks.length === 0 ? styles.centerContent : styles.listContent}
      data={blocks}
      keyExtractor={(b) => b.month}
      renderItem={({ item }) => <MonthBlockItem block={item} onRowPress={handleRowPress} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No results yet.</Text>
          <Text style={styles.emptyBody}>Log your first result on a workout to start your history.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      }
      ListFooterComponent={
        pages > 1 ? (
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
              disabled={page <= 1}
              onPress={() => load(page - 1)}
            >
              <Text style={styles.pageBtnText}>Prev</Text>
            </TouchableOpacity>
            <Text style={styles.pageMeta}>Page {page} of {pages}</Text>
            <TouchableOpacity
              style={[styles.pageBtn, page >= pages && styles.pageBtnDisabled]}
              disabled={page >= pages}
              onPress={() => load(page + 1)}
            >
              <Text style={styles.pageBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#818cf8" />
      }
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  listContent: { paddingVertical: 16 },
  centerContent: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#030712',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    color: '#f87171',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  monthBlock: { marginHorizontal: 16, marginBottom: 24 },
  monthHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  divider: { height: 1, backgroundColor: '#1f2937', marginBottom: 8 },
  row: {
    backgroundColor: '#111827',
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
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeAbbr: { fontSize: 13, fontWeight: '700', color: '#818cf8' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
  rowMeta: { fontSize: 12, color: '#6b7280' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#e5e7eb', marginLeft: 8 },
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
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { color: '#e5e7eb', fontSize: 14, fontWeight: '500' },
  pageMeta: { color: '#6b7280', fontSize: 13 },
})
