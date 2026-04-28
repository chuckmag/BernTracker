import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import {
  api,
  deriveWorkoutGender,
  type Workout,
  type WorkoutLevel,
  type ResultValue,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'

type Props = StackScreenProps<RootStackParamList, 'LogResult'>

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX', label: 'RX' },
  { value: 'SCALED', label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const SUPPORTED_TYPES = new Set(['AMRAP', 'FOR_TIME'])

export default function LogResultScreen({ route, navigation }: Props) {
  const { workoutId, resultId, existingResult } = route.params
  const { user } = useAuth()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loadingWorkout, setLoadingWorkout] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyLogged, setAlreadyLogged] = useState(false)

  // Form state — strings so the inputs work cleanly; parsed at submit.
  const [level, setLevel] = useState<WorkoutLevel>(existingResult?.level ?? 'RX')
  const [rounds, setRounds] = useState(initialAmrap(existingResult?.value).rounds)
  const [reps, setReps] = useState(initialAmrap(existingResult?.value).reps)
  const [minutes, setMinutes] = useState(initialForTime(existingResult?.value).minutes)
  const [seconds, setSeconds] = useState(initialForTime(existingResult?.value).seconds)
  const [cappedOut, setCappedOut] = useState(initialForTime(existingResult?.value).cappedOut)
  const [notes, setNotes] = useState(existingResult?.notes ?? '')

  const isEdit = Boolean(resultId && existingResult)

  useEffect(() => {
    let cancelled = false
    api.workouts.get(workoutId)
      .then((w) => { if (!cancelled) setWorkout(w) })
      .catch(() => { if (!cancelled) setError('Could not load workout.') })
      .finally(() => { if (!cancelled) setLoadingWorkout(false) })
    return () => { cancelled = true }
  }, [workoutId])

  const isSupported = workout ? SUPPORTED_TYPES.has(workout.type) : false

  function buildValue(): { ok: true; value: ResultValue } | { ok: false; error: string } {
    if (!workout) return { ok: false, error: 'Workout not loaded.' }
    if (workout.type === 'AMRAP') {
      const r = Number(rounds)
      const p = Number(reps)
      if (!Number.isInteger(r) || r < 0) return { ok: false, error: 'Rounds must be a non-negative whole number.' }
      if (!Number.isInteger(p) || p < 0) return { ok: false, error: 'Reps must be a non-negative whole number.' }
      return { ok: true, value: { type: 'AMRAP', rounds: r, reps: p } }
    }
    if (workout.type === 'FOR_TIME') {
      const m = Number(minutes || '0')
      const s = Number(seconds || '0')
      if (!Number.isInteger(m) || m < 0) return { ok: false, error: 'Minutes must be a non-negative whole number.' }
      if (!Number.isInteger(s) || s < 0 || s > 59) return { ok: false, error: 'Seconds must be 0–59.' }
      const total = m * 60 + s
      if (total <= 0 && !cappedOut) return { ok: false, error: 'Enter a time, or mark the result as capped.' }
      return { ok: true, value: { type: 'FOR_TIME', seconds: total, cappedOut } }
    }
    return { ok: false, error: 'Result logging is not yet supported for this workout type.' }
  }

  async function handleSubmit() {
    if (!workout) return
    const built = buildValue()
    if (!built.ok) { setError(built.error); return }

    setError(null)
    setAlreadyLogged(false)
    setSubmitting(true)
    try {
      if (isEdit && resultId) {
        await api.results.update(resultId, {
          level,
          value: built.value,
          notes: notes.trim() || null,
        })
      } else {
        const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)
        await api.workouts.logResult(workoutId, {
          level,
          workoutGender,
          value: built.value,
          notes: notes.trim() || undefined,
        })
      }
      navigation.goBack()
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status
      if (status === 409) {
        setAlreadyLogged(true)
      } else {
        setError(e instanceof Error ? e.message : 'Could not save result.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete() {
    if (!resultId) return
    Alert.alert(
      'Delete result?',
      'This will remove your result from the leaderboard.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await api.results.delete(resultId)
              navigation.goBack()
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Could not delete result.')
            } finally {
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  if (loadingWorkout) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Workout not found.'}</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.workoutTitle}>{workout.title}</Text>
        <Text style={styles.workoutType}>{workout.type.replace('_', ' ')}</Text>

        {!isSupported && (
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              Result logging is not yet supported for {workout.type.replace('_', ' ')} workouts.
            </Text>
          </View>
        )}

        {/* Level chips */}
        <Text style={styles.sectionLabel}>LEVEL</Text>
        <View style={styles.chipRow}>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l.value}
              style={[styles.chip, level === l.value && styles.chipActive]}
              onPress={() => setLevel(l.value)}
              disabled={!isSupported}
            >
              <Text style={[styles.chipText, level === l.value && styles.chipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Type-conditional inputs */}
        {workout.type === 'AMRAP' && (
          <>
            <Text style={styles.sectionLabel}>SCORE</Text>
            <View style={styles.inlineInputs}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Rounds</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={rounds}
                  onChangeText={setRounds}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  testID="rounds-input"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={reps}
                  onChangeText={setReps}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  testID="reps-input"
                />
              </View>
            </View>
          </>
        )}

        {workout.type === 'FOR_TIME' && (
          <>
            <Text style={styles.sectionLabel}>TIME</Text>
            <View style={styles.inlineInputs}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Minutes</Text>
                <TextInput
                  style={[styles.input, cappedOut && styles.inputDisabled]}
                  keyboardType="number-pad"
                  value={minutes}
                  onChangeText={setMinutes}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  editable={!cappedOut}
                  testID="minutes-input"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Seconds</Text>
                <TextInput
                  style={[styles.input, cappedOut && styles.inputDisabled]}
                  keyboardType="number-pad"
                  value={seconds}
                  onChangeText={setSeconds}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                  editable={!cappedOut}
                  testID="seconds-input"
                />
              </View>
            </View>
            <TouchableOpacity
              style={styles.toggle}
              onPress={() => setCappedOut((c) => !c)}
              testID="capped-toggle"
            >
              <View style={[styles.checkbox, cappedOut && styles.checkboxChecked]}>
                {cappedOut && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Time capped (didn't finish)</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor="#6b7280"
        />

        {/* Errors */}
        {alreadyLogged && (
          <Text style={styles.error}>You've already logged this workout.</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isSupported || submitting || alreadyLogged) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isSupported || submitting || alreadyLogged}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{isEdit ? 'Save changes' : 'Log result'}</Text>
          }
        </TouchableOpacity>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete result'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function initialAmrap(v: ResultValue | undefined) {
  if (v?.type === 'AMRAP') return { rounds: String(v.rounds), reps: String(v.reps) }
  return { rounds: '', reps: '' }
}

function initialForTime(v: ResultValue | undefined) {
  if (v?.type === 'FOR_TIME') {
    return {
      minutes: String(Math.floor(v.seconds / 60)),
      seconds: String(v.seconds % 60),
      cappedOut: v.cappedOut,
    }
  }
  return { minutes: '', seconds: '', cappedOut: false }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48 },
  center: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  workoutType: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  warningCard: {
    backgroundColor: '#1f1500',
    borderColor: '#a16207',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  warningText: { color: '#fbbf24', fontSize: 13, lineHeight: 18 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
  },
  chipActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  chipText: { color: '#6b7280', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#818cf8', fontWeight: '600' },
  inlineInputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { color: '#9ca3af', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#ffffff',
  },
  inputDisabled: { opacity: 0.4 },
  notesInput: { textAlignVertical: 'top', minHeight: 70 },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { color: '#e5e7eb', fontSize: 14 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  submitBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  deleteBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { color: '#f87171', fontSize: 14, fontWeight: '500' },
})
