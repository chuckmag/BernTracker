import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
} from 'react-native'
import type { RouteProp } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg'
import type { AnalyticsStackParamList } from '../../../App'
import {
  api,
  type BenchmarkHistoryData,
  type BenchmarkHistoryEntry,
  type BenchmarkSummaryEntry,
  type WorkoutLevel,
  type WorkoutGender,
} from '../lib/api'
import type { WorkoutCategory } from '@wodalytics/types'
import { useTheme } from '../lib/theme'

const CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  GIRL_WOD: 'Girl WOD',
  HERO_WOD: 'Hero WOD',
  OPEN_WOD: 'Open WOD',
  GAMES_WOD: 'Games WOD',
  BENCHMARK: 'Benchmark',
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  route: RouteProp<AnalyticsStackParamList, 'BenchmarkDetail'>
  navigation: StackNavigationProp<AnalyticsStackParamList, 'BenchmarkDetail'>
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function formatScore(kind: string | null, value: number | null): string {
  if (kind == null || value == null) return '—'
  switch (kind) {
    case 'TIME': {
      const m = Math.floor(value / 60)
      const s = value % 60
      return `${m}:${String(s).padStart(2, '0')}`
    }
    case 'ROUNDS_REPS': {
      const rounds = Math.floor(value / 1000)
      const reps = value % 1000
      return reps > 0 ? `${rounds}+${reps}` : `${rounds} rounds`
    }
    case 'LOAD':
      return `${value} lb`
    case 'REPS':
      return `${value} reps`
    case 'CALORIES':
      return `${value} cal`
    case 'DISTANCE':
      return `${value} m`
    default:
      return String(value)
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

// Benchmarks span years, so the chart x-axis needs the year. Use ISO-ish
// YYYY/MM/DD so a 2018 attempt is unambiguously distinguishable from 2026.
function shortDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

// ── Trend chart ───────────────────────────────────────────────────────────────

const CHART_W = 280
const CHART_H = 90
const PAD = { top: 8, right: 8, bottom: 24, left: 36 }

interface TrendChartProps {
  entries: BenchmarkHistoryEntry[]
  scoreKind: string | null
}

function TrendChart({ entries, scoreKind }: TrendChartProps) {
  const { colors, isDark } = useTheme()

  const scored = entries
    .filter((e) => e.primaryScoreValue != null)
    .sort((a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime())

  if (scored.length < 2) return null

  const values = scored.map((e) => e.primaryScoreValue!)
  const isTime = scoreKind === 'TIME'
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1

  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom

  function xOf(i: number) {
    return PAD.left + (scored.length === 1 ? innerW / 2 : (i / (scored.length - 1)) * innerW)
  }
  function yOf(v: number) {
    const norm = (v - minV) / range
    // TIME: lower is better → flip so better is higher on chart
    const plotNorm = isTime ? norm : 1 - norm
    return PAD.top + plotNorm * innerH
  }

  const points = scored.map((e, i) => `${xOf(i)},${yOf(e.primaryScoreValue!)}`).join(' ')
  const lineColor = colors.accent
  const gridColor = isDark ? '#1f2937' : '#e2e8f0'
  const tickColor = isDark ? '#6b7280' : '#64748b'

  return (
    <View style={{ alignItems: 'center', marginVertical: 8 }}>
      <Svg width={CHART_W} height={CHART_H}>
        {/* grid lines */}
        {[0, 0.5, 1].map((t) => {
          const y = PAD.top + t * innerH
          return <Line key={t} x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke={gridColor} strokeWidth={1} />
        })}

        {/* x-axis labels — anchor edge labels so YYYY/MM/DD stays inside the canvas */}
        {scored.map((e, i) => {
          const anchor =
            i === 0 ? 'start'
            : i === scored.length - 1 ? 'end'
            : 'middle'
          return (
            <SvgText
              key={i}
              x={xOf(i)}
              y={CHART_H - 4}
              fontSize={9}
              fill={tickColor}
              textAnchor={anchor}
            >
              {shortDate(e.achievedAt)}
            </SvgText>
          )
        })}

        {/* line */}
        <Polyline points={points} fill="none" stroke={lineColor} strokeWidth={2} />

        {/* dots */}
        {scored.map((e, i) => (
          <Circle key={i} cx={xOf(i)} cy={yOf(e.primaryScoreValue!)} r={3} fill={lineColor} />
        ))}
      </Svg>
    </View>
  )
}

// ── Add Result Modal ──────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

interface AddResultModalProps {
  visible: boolean
  entry: BenchmarkSummaryEntry
  scoreKind: string | null
  onClose: () => void
  onSaved: (result: BenchmarkHistoryEntry) => void
}

const LEVELS: WorkoutLevel[] = ['RX_PLUS', 'RX', 'SCALED', 'MODIFIED']
const LEVEL_LABELS: Record<WorkoutLevel, string> = {
  RX_PLUS: 'RX+',
  RX: 'RX',
  SCALED: 'Scaled',
  MODIFIED: 'Modified',
}

function AddResultModal({ visible, entry, scoreKind, onClose, onSaved }: AddResultModalProps) {
  const { colors, isDark } = useTheme()
  const [date, setDate] = useState(todayStr())
  const [timeMin, setTimeMin] = useState('')
  const [timeSec, setTimeSec] = useState('')
  const [roundsVal, setRoundsVal] = useState('')
  const [repsVal, setRepsVal] = useState('')
  const [loadVal, setLoadVal] = useState('')
  const [genericVal, setGenericVal] = useState('')
  const [level, setLevel] = useState<WorkoutLevel>('RX')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setDate(todayStr())
    setTimeMin(''); setTimeSec('')
    setRoundsVal(''); setRepsVal('')
    setLoadVal(''); setGenericVal('')
    setLevel('RX'); setNotes('')
    setError(null)
  }

  function buildScore(): object | null {
    switch (scoreKind) {
      case 'TIME': {
        const m = parseInt(timeMin || '0', 10)
        const s = parseInt(timeSec || '0', 10)
        if (isNaN(m) || isNaN(s)) return null
        return { kind: 'TIME', seconds: m * 60 + s, cappedOut: false }
      }
      case 'ROUNDS_REPS': {
        const r = parseInt(roundsVal || '0', 10)
        const rp = parseInt(repsVal || '0', 10)
        if (isNaN(r) || isNaN(rp)) return null
        return { kind: 'ROUNDS_REPS', rounds: r, reps: rp, cappedOut: false }
      }
      case 'LOAD': {
        const l = parseFloat(loadVal)
        if (isNaN(l) || l <= 0) return null
        return { kind: 'LOAD', load: l, unit: 'LB' }
      }
      case 'REPS': {
        const v = parseInt(genericVal, 10)
        if (isNaN(v)) return null
        return { kind: 'REPS', reps: v }
      }
      case 'CALORIES': {
        const v = parseInt(genericVal, 10)
        if (isNaN(v)) return null
        return { kind: 'CALORIES', calories: v }
      }
      default:
        return null
    }
  }

  async function handleSave() {
    setError(null)
    const score = buildScore()
    if (scoreKind && !score) {
      setError('Enter a valid score.')
      return
    }
    setSaving(true)
    try {
      const result = await api.benchmarks.logResult(entry.id, {
        achievedAt: new Date(`${date}T12:00:00.000Z`).toISOString(),
        level,
        workoutGender: 'MALE' as WorkoutGender,
        value: score ? { score, movementResults: [] } : { movementResults: [] },
        notes: notes.trim() || undefined,
      })
      onSaved({
        source: 'manual',
        id: result.id,
        achievedAt: result.achievedAt,
        level: result.level,
        workoutGender: result.workoutGender,
        value: result.value,
        notes: result.notes,
        primaryScoreKind: result.primaryScoreKind,
        primaryScoreValue: result.primaryScoreValue,
        createdAt: result.createdAt,
      })
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save result')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = [
    s.input,
    { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
  ]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.modalContainer, { backgroundColor: colors.cardBg }]}>
        <View style={s.modalHeader}>
          <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Add Result</Text>
          <TouchableOpacity onPress={() => { reset(); onClose() }} accessibilityLabel="Close">
            <Text style={[s.modalClose, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
          {/* Date */}
          <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={inputStyle}
            value={date}
            onChangeText={setDate}
            placeholder="2026-01-15"
            placeholderTextColor={colors.textPlaceholder}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />

          {/* Score inputs by kind */}
          {scoreKind === 'TIME' && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Time</Text>
              <View style={s.row}>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={timeMin}
                  onChangeText={setTimeMin}
                  placeholder="MM"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={[s.timeSep, { color: colors.textSecondary }]}>:</Text>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={timeSec}
                  onChangeText={setTimeSec}
                  placeholder="SS"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
            </>
          )}

          {scoreKind === 'ROUNDS_REPS' && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Rounds + Reps</Text>
              <View style={s.row}>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={roundsVal}
                  onChangeText={setRoundsVal}
                  placeholder="Rounds"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="number-pad"
                />
                <Text style={[s.timeSep, { color: colors.textSecondary }]}>+</Text>
                <TextInput
                  style={[inputStyle, { flex: 1 }]}
                  value={repsVal}
                  onChangeText={setRepsVal}
                  placeholder="Reps"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="number-pad"
                />
              </View>
            </>
          )}

          {scoreKind === 'LOAD' && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Load (lb)</Text>
              <TextInput
                style={inputStyle}
                value={loadVal}
                onChangeText={setLoadVal}
                placeholder="135"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="decimal-pad"
              />
            </>
          )}

          {(scoreKind === 'REPS' || scoreKind === 'CALORIES' || scoreKind === 'DISTANCE') && (
            <>
              <Text style={[s.fieldLabel, { color: colors.textLabel }]}>
                {scoreKind === 'REPS' ? 'Reps' : scoreKind === 'CALORIES' ? 'Calories' : 'Distance (m)'}
              </Text>
              <TextInput
                style={inputStyle}
                value={genericVal}
                onChangeText={setGenericVal}
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="number-pad"
              />
            </>
          )}

          {/* Level */}
          <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Level</Text>
          <View style={s.levelStrip}>
            {LEVELS.map((l) => (
              <TouchableOpacity
                key={l}
                style={[
                  s.levelBtn,
                  { borderColor: colors.borderInteractive },
                  level === l && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => setLevel(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: level === l }}
              >
                <Text style={[s.levelBtnText, { color: level === l ? '#020617' : colors.textSecondary }]}>
                  {LEVEL_LABELS[l]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Notes */}
          <Text style={[s.fieldLabel, { color: colors.textLabel }]}>Notes (optional)</Text>
          <TextInput
            style={[inputStyle, s.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any notes…"
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={3}
          />

          {error && <Text style={s.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving
              ? <ActivityIndicator color="#020617" />
              : <Text style={s.saveBtnText}>Save Result</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

// ── History row ───────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: BenchmarkHistoryEntry
  scoreKind: string | null
  colors: ReturnType<typeof useTheme>['colors']
  onDelete: () => void
}

function HistoryRow({ item, scoreKind, colors, onDelete }: HistoryRowProps) {
  // Always prefer the result's own primaryScoreKind — the server sets it per result.
  // Fall back to the parent's derived kind only if the result has none.
  const scoreText = formatScore(item.primaryScoreKind ?? scoreKind, item.primaryScoreValue)
  const levelColor = item.level === 'RX' ? '#818cf8' : item.level === 'RX_PLUS' ? '#a78bfa' : '#6b7280'

  function confirmDelete() {
    Alert.alert('Delete result?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ])
  }

  return (
    <View style={[s.historyRow, { borderColor: colors.borderSubtle }]}>
      <View style={s.historyMain}>
        <Text style={[s.historyDate, { color: colors.textTertiary }]}>{formatDate(item.achievedAt)}</Text>
        <Text style={[s.historyScore, { color: colors.textPrimary }]}>{scoreText}</Text>
        {item.notes ? (
          <Text style={[s.historyNotes, { color: colors.textTertiary }]} numberOfLines={2}>
            {item.notes}
          </Text>
        ) : null}
      </View>
      <View style={s.historyRight}>
        <Text style={[s.historyLevel, { color: levelColor }]}>{LEVEL_LABELS[item.level]}</Text>
        <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.deleteBtn}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BenchmarkDetailScreen({ route }: Props) {
  const { entry } = route.params
  const { colors } = useTheme()

  const [historyData, setHistoryData] = useState<BenchmarkHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)

  async function loadHistory() {
    setError(null)
    try {
      const data = await api.benchmarks.history(entry.id)
      setHistoryData(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  function handleResultSaved(result: BenchmarkHistoryEntry) {
    setHistoryData((prev) => {
      if (!prev) return null
      const updated = [result, ...prev.history].sort(
        (a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime(),
      )
      return { ...prev, history: updated }
    })
  }

  async function handleDelete(resultId: string) {
    try {
      await api.benchmarks.deleteResult(entry.id, resultId)
      setHistoryData((prev) =>
        prev ? { ...prev, history: prev.history.filter((h) => h.id !== resultId) } : null,
      )
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete result')
    }
  }

  const history = historyData?.history ?? []

  // Score kind comes from the actual logged results (server-set, per-result).
  // Fall back to the template workout's mapped kind only if no history exists yet —
  // many benchmarks have a null templateWorkout, so we cannot rely on it alone.
  const scoreKind =
    history.find((h) => h.primaryScoreKind != null)?.primaryScoreKind
    ?? (entry.templateWorkout ? deriveScoreKind(entry.templateWorkout.type) : null)

  // "Best" depends on the score kind: TIME is lower-is-better; everything else is higher-is-better.
  const bestEntry = pickBest(history, scoreKind)
  const bestScoreText = bestEntry
    ? formatScore(bestEntry.primaryScoreKind ?? scoreKind, bestEntry.primaryScoreValue)
    : null

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.screenBg }]} contentContainerStyle={s.content}>
      {/* Header card — name + category + best score */}
      <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
        <View style={s.headerRow}>
          <Text style={[s.whodName, { color: colors.textPrimary }]}>{entry.name}</Text>
          <View style={[s.categoryPill, { borderColor: colors.primary }]}>
            <Text style={[s.categoryPillText, { color: colors.primary }]}>
              {CATEGORY_LABELS[entry.category]}
            </Text>
          </View>
        </View>
        {entry.templateWorkout?.type ? (
          <Text style={[s.workoutType, { color: colors.textTertiary }]}>
            {entry.templateWorkout.type.replace(/_/g, ' ')}
          </Text>
        ) : null}
        {bestScoreText && (
          <Text style={[s.bestScore, { color: colors.accent }]}>Best: {bestScoreText}</Text>
        )}
      </View>

      {/* Description card — full WOD prescription */}
      {(entry.templateWorkout?.description || entry.description) ? (
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Description</Text>
          <Text style={[s.descText, { color: colors.textPrimary }]}>
            {entry.templateWorkout?.description || entry.description}
          </Text>
        </View>
      ) : null}

      {/* Movements card — chip list */}
      {entry.templateWorkout?.workoutMovements && entry.templateWorkout.workoutMovements.length > 0 ? (
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Movements</Text>
          <View style={s.movementChips}>
            {entry.templateWorkout.workoutMovements.map((wm) => (
              <View
                key={wm.movement.id}
                style={[s.movementChip, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}
              >
                <Text style={[s.movementChipText, { color: colors.textSecondary }]}>{wm.movement.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Trend chart */}
      {!loading && !error && history.length >= 2 && (
        <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Trend</Text>
          <TrendChart entries={history} scoreKind={scoreKind} />
        </View>
      )}

      {/* History */}
      <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle }]}>
        <View style={s.historyHeader}>
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>History</Text>
          <TouchableOpacity
            style={[s.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => setModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Add result"
          >
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {!loading && error && (
          <Text style={s.errorText}>{error}</Text>
        )}
        {!loading && !error && history.length === 0 && (
          <Text style={[s.emptyText, { color: colors.textTertiary }]}>No results yet. Tap + Add to log one.</Text>
        )}
        {!loading && !error && history.map((item) => (
          <HistoryRow
            key={item.id}
            item={item}
            scoreKind={scoreKind}
            colors={colors}
            onDelete={() => handleDelete(item.id)}
          />
        ))}
      </View>

      <AddResultModal
        visible={modalVisible}
        entry={entry}
        scoreKind={scoreKind}
        onClose={() => setModalVisible(false)}
        onSaved={handleResultSaved}
      />
    </ScrollView>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns the "best" history entry per scoreKind:
//   TIME → lowest seconds (fastest); everything else → highest value.
// Entries with no primaryScoreValue are skipped. Ties are broken in favor of the
// most recent achievedAt so the header reflects the user's latest PR achievement.
function pickBest(
  history: BenchmarkHistoryEntry[],
  scoreKind: string | null,
): BenchmarkHistoryEntry | null {
  const scored = history.filter((h) => h.primaryScoreValue != null)
  if (scored.length === 0) return null
  const lowerIsBetter = scoreKind === 'TIME'
  return scored.reduce((best, cur) => {
    const a = cur.primaryScoreValue as number
    const b = best.primaryScoreValue as number
    if (a === b) return new Date(cur.achievedAt) > new Date(best.achievedAt) ? cur : best
    if (lowerIsBetter) return a < b ? cur : best
    return a > b ? cur : best
  })
}

function deriveScoreKind(workoutType: string): string | null {
  if (['AMRAP', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'LADDER', 'DEATH_BY'].includes(workoutType)) {
    return 'ROUNDS_REPS'
  }
  if (['STRENGTH', 'POWER_LIFTING', 'WEIGHT_LIFTING', 'BODY_BUILDING', 'MAX_EFFORT'].includes(workoutType)) {
    return 'LOAD'
  }
  if (['FOR_TIME', 'CHIPPER', 'CARDIO', 'RUNNING', 'ROWING', 'BIKING', 'SWIMMING', 'SKI_ERG', 'MIXED_MONO'].includes(workoutType)) {
    return 'TIME'
  }
  return null
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },

  whodName: { fontSize: 20, fontWeight: '700', flex: 1 },
  whodDesc: { fontSize: 14, lineHeight: 20 },
  bestScore: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryPillText: { fontSize: 11, fontWeight: '600' },
  workoutType: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  descText: { fontSize: 14, lineHeight: 20 },
  movementChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  movementChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  movementChipText: { fontSize: 12 },

  sectionTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#020617' },

  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
    gap: 8,
  },
  historyMain: { flex: 1, gap: 2 },
  historyDate: { fontSize: 11 },
  historyScore: { fontSize: 15, fontWeight: '600' },
  historyNotes: { fontSize: 12, marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: 6 },
  historyLevel: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { fontSize: 14, color: '#6b7280', paddingLeft: 4 },

  center: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  errorText: { color: '#f87171', fontSize: 14 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalClose: { fontSize: 15 },
  modalContent: { padding: 16, gap: 8, paddingBottom: 40 },

  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeSep: { fontSize: 20, fontWeight: '300' },

  levelStrip: { flexDirection: 'row', gap: 6 },
  levelBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
  },
  levelBtnText: { fontSize: 12, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#2BA8A4',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#020617' },
})
