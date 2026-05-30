import { useEffect, useState } from 'react'
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import {
  api,
  type MovementHistoryPage,
  type MovementHistoryResult,
  type StrengthPrEntry,
} from '../lib/api'
import { shortDate } from '../lib/format'
import { bestE1RMFromSets } from '../lib/e1rm'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

// ─── STRENGTH PR table (1–10RM scaffold, ??? for untested) ───────────────────

const RM_RANGE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

interface StrengthPrTableProps {
  entries: StrengthPrEntry[]
  onTapEmpty: (rm: number) => void
  onTapFilled: (workoutId: string) => void
}

function StrengthPrTable({ entries, onTapEmpty, onTapFilled }: StrengthPrTableProps) {
  const { colors } = useTheme()
  const byReps = new Map(entries.map((e) => [e.reps, e]))
  const unit = entries[0]?.unit ?? 'LB'
  return (
    <View>
      <ThemedText variant="label" style={s.subLabel}>PR TABLE · {unit}</ThemedText>
      <View style={s.rmGrid}>
        {RM_RANGE.map((reps) => {
          const entry = byReps.get(reps)
          if (entry) {
            return (
              <TouchableOpacity
                key={reps}
                style={[
                  s.rmCell,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderSubtle },
                ]}
                onPress={() => onTapFilled(entry.workoutId)}
                activeOpacity={0.7}
              >
                <ThemedText variant="tertiary" style={s.rmRep}>{reps}RM</ThemedText>
                <ThemedText style={s.rmLoad}>{String(entry.maxLoad)}</ThemedText>
              </TouchableOpacity>
            )
          }
          return (
            <TouchableOpacity
              key={reps}
              style={[
                s.rmCell,
                s.rmCellEmpty,
                { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
              ]}
              onPress={() => onTapEmpty(reps)}
              activeOpacity={0.7}
            >
              <ThemedText variant="tertiary" style={s.rmRep}>{reps}RM</ThemedText>
              <ThemedText variant="muted" style={s.rmEmpty}>???</ThemedText>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Est. 1RM trend (proportional bar chart, no external library) ─────────────

function E1RMTrend({ results }: { results: MovementHistoryResult[] }) {
  const { colors } = useTheme()
  const points = [...results]
    .sort((a, b) => a.workout.scheduledAt.localeCompare(b.workout.scheduledAt))
    .map((r) => {
      const best = bestE1RMFromSets(r.movementSets)
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
      <ThemedText variant="label" style={s.subLabel}>EST. 1RM TREND</ThemedText>
      {points.map((p, i) => (
        <View key={i} style={s.trendRow}>
          <ThemedText variant="tertiary" style={s.trendDate}>{p.date}</ThemedText>
          <View style={[s.trendTrack, { backgroundColor: colors.borderSubtle }]}>
            <View
              style={[
                s.trendBar,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round((p.e1rm / max) * 100)}%`,
                },
              ]}
            />
          </View>
          <View style={s.trendRight}>
            <ThemedText variant="secondary" style={s.trendE1rm}>{p.e1rm}</ThemedText>
            <ThemedText variant="tertiary" style={s.trendEffort}>{p.effort}</ThemedText>
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
  const { colors } = useTheme()
  const visibleSets = result.movementSets.slice(0, 4)
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
    >
      <ThemedView variant="card" style={[s.card, { borderColor: colors.borderSubtle }]}>
        <View style={[s.cardHeader, { borderBottomColor: colors.borderSubtle }]}>
          <ThemedText variant="tertiary" style={s.cardDate}>{shortDate(result.workout.scheduledAt)}</ThemedText>
          <ThemedText variant="secondary" style={s.cardTitle} numberOfLines={1}>{result.workout.title}</ThemedText>
        </View>
        <View style={s.cardSets}>
          {visibleSets.map((set, i) => (
            <ThemedText key={i} variant="tertiary" style={s.cardSet}>
              <ThemedText variant="label">{i + 1}  </ThemedText>
              {describeSet(set, result.loadUnit)}
            </ThemedText>
          ))}
          {result.movementSets.length > 4 && (
            <ThemedText variant="label" style={s.cardMore}>+{result.movementSets.length - 4} more</ThemedText>
          )}
        </View>
      </ThemedView>
    </TouchableOpacity>
  )
}

// ─── PR Backfill Modal ────────────────────────────────────────────────────────

interface BackfillModalProps {
  movementId: string
  movementName: string
  rm: number
  onClose: () => void
  onSaved: () => void
}

function BackfillModal({ movementId, movementName, rm, onClose, onSaved }: BackfillModalProps) {
  const { colors, isDark } = useTheme()
  const [loadInput, setLoadInput] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [saving, setSaving] = useState(false)
  const [showAndroidPicker, setShowAndroidPicker] = useState(false)

  const maxDate = new Date()

  async function handleSave() {
    const load = parseFloat(loadInput)
    if (!loadInput || isNaN(load) || load <= 0) {
      Alert.alert('Enter a load', 'Please enter the weight you lifted.')
      return
    }

    setSaving(true)
    try {
      const workout = await api.me.personalProgram.workouts.create({
        title: `${movementName} ${rm}RM`,
        description: `${rm} × ${load} lb`,
        type: 'STRENGTH',
        scheduledAt: selectedDate.toISOString(),
        movementIds: [movementId],
      })

      await api.workouts.logResult(workout.id, {
        level: 'RX',
        workoutGender: 'OPEN',
        notes: notes.trim() || undefined,
        value: {
          movementResults: [
            {
              workoutMovementId: movementId,
              loadUnit: 'LB',
              sets: [{ reps: String(rm), load }],
            },
          ],
        },
      })

      onSaved()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save effort.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: colors.borderInteractive,
    color: colors.textPrimary,
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ThemedView
          variant="card"
          style={[s.modalSheet, { borderColor: colors.borderSubtle }]}
        >
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <ThemedText style={s.modalTitle}>{rm}RM — {movementName}</ThemedText>
            <ThemedText variant="tertiary" style={s.modalSubtitle}>Log your max effort for this rep count</ThemedText>

            <ThemedText variant="label" style={s.fieldLabel}>LOAD (LB)</ThemedText>
            <TextInput
              style={[s.loadInput, inputStyle]}
              value={loadInput}
              onChangeText={setLoadInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 185"
              placeholderTextColor={colors.textPlaceholder}
              autoFocus
            />

            <ThemedText variant="label" style={s.fieldLabel}>NOTES (OPTIONAL)</ThemedText>
            <TextInput
              style={[s.notesInput, inputStyle]}
              value={notes}
              onChangeText={setNotes}
              placeholder="How did it feel? Any context…"
              placeholderTextColor={colors.textPlaceholder}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <ThemedText variant="label" style={s.fieldLabel}>DATE</ThemedText>
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="inline"
                maximumDate={maxDate}
                onChange={(_, date) => { if (date) setSelectedDate(date) }}
                style={s.datePicker}
                themeVariant={isDark ? 'dark' : 'light'}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={[s.dateRow, inputStyle]}
                  onPress={() => setShowAndroidPicker(true)}
                  activeOpacity={0.7}
                >
                  <ThemedText variant="secondary" style={s.dateLabel}>
                    {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </ThemedText>
                </TouchableOpacity>
                {showAndroidPicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="default"
                    maximumDate={maxDate}
                    onChange={(_, date) => {
                      setShowAndroidPicker(false)
                      if (date) setSelectedDate(date)
                    }}
                  />
                )}
              </>
            )}
          </ScrollView>

          <View style={s.modalActions}>
            <TouchableOpacity
              style={[s.cancelBtn, { backgroundColor: colors.borderSubtle }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <ThemedText variant="tertiary" style={s.cancelBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.primary }, saving && s.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <ThemedText style={[s.saveBtnText, { color: colors.onPrimary }]}>Save</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Main exported component ──────────────────────────────────────────────────

interface Props {
  movementId: string
  movementName: string
  // Loose nav type so this component can be mounted from any screen in
  // the root stack (WodDetail, GoalDetail, etc.). The component only
  // pushes to 'WodDetail' internally.
  navigation: StackNavigationProp<RootStackParamList>
}

export default function MovementHistorySection({ movementId, movementName, navigation }: Props) {
  const { colors } = useTheme()
  const [data, setData] = useState<MovementHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingRm, setPendingRm] = useState<number | null>(null)

  function fetchHistory() {
    setLoading(true)
    api.movements.myHistory(movementId, 1, 10)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchHistory() }, [movementId])

  if (loading) {
    return (
      <View style={s.loadingRow}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    )
  }

  if (!data) return null

  const isStrength = data.prTable.category === 'STRENGTH'
  const hasResults = data.results.length > 0
  if (!isStrength && !hasResults) return null

  return (
    <View style={s.root}>
      <ThemedText variant="tertiary" style={s.movementName}>{movementName}</ThemedText>

      {isStrength && (
        <StrengthPrTable
          entries={(data.prTable as { category: 'STRENGTH'; entries: StrengthPrEntry[] }).entries}
          onTapEmpty={(rm) => setPendingRm(rm)}
          onTapFilled={(workoutId) => navigation.push('WodDetail', { workoutId, from: 'movement-history' })}
        />
      )}

      {isStrength && hasResults && <E1RMTrend results={data.results} />}

      {hasResults && (
        <View style={s.pastResults}>
          <ThemedText variant="label" style={s.subLabel}>PAST RESULTS</ThemedText>
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

      {pendingRm !== null && (
        <BackfillModal
          movementId={movementId}
          movementName={movementName}
          rm={pendingRm}
          onClose={() => setPendingRm(null)}
          onSaved={() => {
            setPendingRm(null)
            fetchHistory()
          }}
        />
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Module-level static styles. Anything theme-dependent (background, border,
// text color) is layered on inline at the call site from useTheme() — see the
// design-system docs in apps/mobile/CLAUDE.md.

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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
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
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 52,
  },
  rmCellEmpty: {
    borderStyle: 'dashed',
  },
  rmRep: {
    fontSize: 10,
  },
  rmLoad: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  rmEmpty: {
    fontSize: 13,
    fontWeight: '700',
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
    width: 46,
  },
  trendTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trendBar: {
    height: '100%',
    borderRadius: 3,
  },
  trendRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  trendE1rm: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendEffort: {
    fontSize: 10,
  },

  // Past result cards
  pastResults: {
    gap: 6,
  },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  cardDate: {
    fontSize: 11,
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  cardSets: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  cardSet: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  cardMore: {
    fontSize: 11,
    marginTop: 2,
  },

  // Backfill modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 0,
    maxHeight: '92%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  loadInput: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 20,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    minHeight: 72,
  },
  datePicker: {
    marginBottom: 16,
    marginHorizontal: -8,
  },
  dateRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 20,
    paddingBottom: 36,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
})
