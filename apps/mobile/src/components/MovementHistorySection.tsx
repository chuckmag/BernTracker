import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import {
  api,
  type MovementHistoryPage,
  type MovementHistoryResult,
  type StrengthPrEntry,
} from '../lib/api'
import { shortDate } from '../lib/format'

// ─── e1RM calculator (strengthlevel.com percentages) ──────────────────────────

const E1RM_PCT: Record<number, number> = {
  1: 1.00, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
}

interface BestSet { reps: number; load: number; e1rm: number }

function bestE1RM(result: MovementHistoryResult): BestSet | null {
  let best: BestSet | null = null
  for (const set of result.movementSets) {
    if (set.load === undefined || !set.reps) continue
    const reps = parseInt(set.reps, 10)
    const pct = E1RM_PCT[reps]
    if (!pct) continue
    const e1rm = Math.round((set.load / pct) * 10) / 10
    if (best === null || e1rm > best.e1rm) best = { reps, load: set.load, e1rm }
  }
  return best
}

// ─── STRENGTH PR table (1–10RM scaffold, ??? for untested) ───────────────────

const RM_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function StrengthPrTable({ entries }: { entries: StrengthPrEntry[] }) {
  const byReps = new Map(entries.map((e) => [e.reps, e]))
  const unit = entries[0]?.unit ?? 'LB'
  return (
    <View>
      <Text style={s.subLabel}>PR TABLE · {unit}</Text>
      <View style={s.rmGrid}>
        {RM_RANGE.map((reps) => {
          const entry = byReps.get(reps)
          return (
            <View key={reps} style={s.rmCell}>
              <Text style={s.rmRep}>{reps}RM</Text>
              <Text style={entry ? s.rmLoad : s.rmEmpty}>
                {entry ? String(entry.maxLoad) : '???'}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ─── Est. 1RM trend (proportional bar chart, no external library) ─────────────

function E1RMTrend({ results }: { results: MovementHistoryResult[] }) {
  const points = [...results]
    .reverse()
    .map((r) => {
      const best = bestE1RM(r)
      if (!best) return null
      return {
        date: shortDate(r.workout.scheduledAt),
        effort: `${best.reps} × ${best.load}`,
        e1rm: best.e1rm,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  if (points.length < 2) return null

  const max = Math.max(...points.map((p) => p.e1rm))

  return (
    <View style={s.trendSection}>
      <Text style={s.subLabel}>EST. 1RM TREND</Text>
      {points.map((p, i) => (
        <View key={i} style={s.trendRow}>
          <Text style={s.trendDate}>{p.date}</Text>
          <View style={s.trendTrack}>
            <View style={[s.trendBar, { width: `${Math.round((p.e1rm / max) * 100)}%` }]} />
          </View>
          <View style={s.trendRight}>
            <Text style={s.trendE1rm}>{p.e1rm}</Text>
            <Text style={s.trendEffort}>{p.effort}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

// ─── Past result card ─────────────────────────────────────────────────────────

function describeSet(set: MovementHistoryResult['movementSets'][number], loadUnit?: string): string {
  if (set.load !== undefined) {
    const unit = loadUnit ? ` ${loadUnit.toLowerCase()}` : ''
    return `${set.reps ?? '?'} × ${set.load}${unit}`
  }
  if (set.reps) return `${set.reps} reps`
  if (set.calories !== undefined) return `${set.calories} cal`
  if (set.distance !== undefined) {
    const unit = set.distanceUnit ? ` ${set.distanceUnit.toLowerCase()}` : ''
    return `${set.distance}${unit}`
  }
  return '—'
}

interface PastResultCardProps {
  result: MovementHistoryResult
  onPress: () => void
}

function PastResultCard({ result, onPress }: PastResultCardProps) {
  const visibleSets = result.movementSets.slice(0, 4)
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.cardHeader}>
        <Text style={s.cardDate}>{shortDate(result.workout.scheduledAt)}</Text>
        <Text style={s.cardTitle} numberOfLines={1}>{result.workout.title}</Text>
      </View>
      <View style={s.cardSets}>
        {visibleSets.map((set, i) => (
          <Text key={i} style={s.cardSet}>
            <Text style={s.cardSetNum}>{i + 1}  </Text>
            {describeSet(set, result.loadUnit)}
          </Text>
        ))}
        {result.movementSets.length > 4 && (
          <Text style={s.cardMore}>+{result.movementSets.length - 4} more</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

interface Props {
  movementId: string
  movementName: string
  navigation: StackNavigationProp<RootStackParamList, 'WodDetail'>
}

export default function MovementHistorySection({ movementId, movementName, navigation }: Props) {
  const [data, setData] = useState<MovementHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.movements.myHistory(movementId, 1, 10)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [movementId])

  if (loading) {
    return (
      <View style={s.loadingRow}>
        <ActivityIndicator size="small" color="#818cf8" />
      </View>
    )
  }

  if (!data) return null

  const isStrength = data.prTable.category === 'STRENGTH'
  const hasResults = data.results.length > 0
  if (!isStrength && !hasResults) return null

  return (
    <View style={s.root}>
      <Text style={s.movementName}>{movementName}</Text>

      {isStrength && (
        <StrengthPrTable entries={(data.prTable as { category: 'STRENGTH'; entries: StrengthPrEntry[] }).entries} />
      )}

      {isStrength && hasResults && <E1RMTrend results={data.results} />}

      {hasResults && (
        <View style={s.pastResults}>
          <Text style={s.subLabel}>PAST RESULTS</Text>
          {data.results.map((r) => (
            <PastResultCard
              key={r.id}
              result={r}
              onPress={() =>
                navigation.push('WodDetail', {
                  workoutId: r.workout.id,
                  from: 'movement-history',
                })
              }
            />
          ))}
        </View>
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    marginBottom: 20,
    gap: 14,
  },
  loadingRow: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  movementName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4b5563',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // PR table
  rmGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  rmCell: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 52,
  },
  rmRep: {
    fontSize: 10,
    color: '#6b7280',
  },
  rmLoad: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 2,
  },
  rmEmpty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 2,
  },

  // e1RM trend
  trendSection: {
    gap: 0,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 5,
  },
  trendDate: {
    fontSize: 11,
    color: '#6b7280',
    width: 46,
  },
  trendTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#1f2937',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trendBar: {
    height: '100%',
    backgroundColor: '#818cf8',
    borderRadius: 3,
  },
  trendRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  trendE1rm: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  trendEffort: {
    fontSize: 10,
    color: '#6b7280',
  },

  // Past result cards
  pastResults: {
    gap: 6,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  cardDate: {
    fontSize: 11,
    color: '#6b7280',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#d1d5db',
    flex: 1,
  },
  cardSets: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  cardSet: {
    fontSize: 12,
    color: '#9ca3af',
    fontVariant: ['tabular-nums'],
  },
  cardSetNum: {
    color: '#4b5563',
  },
  cardMore: {
    fontSize: 11,
    color: '#4b5563',
    marginTop: 2,
  },
})
