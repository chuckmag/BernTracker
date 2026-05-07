import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type Workout, type WorkoutType } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = StackScreenProps<RootStackParamList, 'WorkoutEditor'>

// Mirrors `TIME_CAP_TYPES` in apps/web/src/components/WorkoutDrawer.tsx —
// these categories surface a workout-level time cap input. Strength,
// Skill Work, and Warmup-Recovery hide the field.
const TIME_CAP_TYPES = new Set<WorkoutType>([
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
])

// Same display order as the web drawer + the existing
// AddPersonalWorkoutScreen this generalizes.
const CATEGORY_ORDER: ReadonlyArray<string> = [
  'Strength',
  'Metcon',
  'MonoStructural',
  'Skill Work',
  'Warmup/Recovery',
]

function formatDayLabel(scheduledAt: string): string {
  // Accept either a YYYY-MM-DD key (create flow) or an ISO timestamp (edit
  // flow loads workout.scheduledAt). Slice off any time portion so we
  // bucket on the calendar date the workout was scheduled for, regardless
  // of viewer timezone — same convention as `AddPersonalWorkoutScreen`.
  const dateKey = scheduledAt.slice(0, 10)
  const [y, mo, d] = dateKey.split('-').map(Number)
  if (!y || !mo || !d) return scheduledAt
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// "20" / "20:00" → seconds. Returns null for empty input, undefined for
// malformed. Mirrors `parseMmss` on web (apps/web/src/components/WorkoutDrawer.tsx).
function parseMmss(input: string): number | null | undefined {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (!trimmed.includes(':')) {
    const n = parseInt(trimmed, 10)
    return Number.isInteger(n) && n >= 0 ? n : undefined
  }
  const [m, s] = trimmed.split(':')
  const mi = parseInt(m, 10)
  const si = parseInt(s, 10)
  if (!Number.isInteger(mi) || mi < 0 || !Number.isInteger(si) || si < 0 || si > 59) {
    return undefined
  }
  return mi * 60 + si
}

function formatMmss(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function WorkoutEditorScreen({ navigation, route }: Props) {
  const { mode, workoutId, scheduledAt: scheduledAtParam } = route.params
  const { colors } = useTheme()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coachNotes, setCoachNotes] = useState('')
  const [type, setType] = useState<WorkoutType>('METCON')
  const [timeCapInput, setTimeCapInput] = useState('')
  const [scheduledAt, setScheduledAt] = useState(scheduledAtParam ?? '')
  const [typePickerOpen, setTypePickerOpen] = useState(false)

  const [loading, setLoading] = useState(mode === 'edit')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit mode: hydrate from server. Create mode skips the fetch and uses
  // the param-supplied scheduledAt + sensible defaults.
  useEffect(() => {
    if (mode !== 'edit' || !workoutId) return
    let cancelled = false
    api.workouts.get(workoutId)
      .then((w: Workout) => {
        if (cancelled) return
        setTitle(w.title)
        setDescription(w.description)
        setCoachNotes(w.coachNotes ?? '')
        setType(w.type)
        setTimeCapInput(formatMmss(w.timeCapSeconds))
        setScheduledAt(w.scheduledAt)
        setLoading(false)
        navigation.setOptions({ title: 'Edit Workout' })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load workout.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [mode, workoutId, navigation])

  // "Done" affordance in the modal header so the keyboard can always be
  // dismissed — multiline TextInputs consume return keys as newlines, so
  // without this users can get stuck after editing the description.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={Keyboard.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={styles.headerDoneBtn}
          testID="dismiss-keyboard-button"
        >
          <ThemedText style={[styles.headerDoneText, { color: colors.primary }]}>Done</ThemedText>
        </TouchableOpacity>
      ),
    })
  }, [navigation, colors.primary])

  const typesByCategory = useMemo(() => {
    const groups: Record<string, WorkoutType[]> = {}
    for (const [t, style] of Object.entries(WORKOUT_TYPE_STYLES) as Array<[WorkoutType, typeof WORKOUT_TYPE_STYLES[WorkoutType]]>) {
      // Hide deprecated types from the picker unless they're the currently
      // selected type — matches the web drawer's filter so legacy rows
      // stay editable but new authors don't reach for them.
      if (style.deprecated && t !== type) continue
      const cat = style.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    }
    return groups
  }, [type])

  const showTimeCap = TIME_CAP_TYPES.has(type)
  const parsedTimeCap = parseMmss(timeCapInput)
  const timeCapInvalid = timeCapInput.trim().length > 0 && parsedTimeCap === undefined
  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    !submitting &&
    !deleting &&
    !timeCapInvalid

  async function handleSave() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // null clears an existing cap on edit; undefined leaves it unset on create.
      // Hidden time-cap field always wipes (e.g. user changed type from AMRAP to STRENGTH).
      const timeCapSeconds = !showTimeCap ? null : parsedTimeCap ?? null

      // Empty coach notes = explicit clear on edit (server schema accepts
      // null), or "don't send the field" on create (the server treats absent
      // as null too — both yield the same persisted state).
      const trimmedCoachNotes = coachNotes.trim()

      if (mode === 'create') {
        // YYYY-MM-DD → noon UTC so the workout lands on the same calendar
        // date for every viewer (matches AddPersonalWorkoutScreen + web).
        const iso = new Date(`${scheduledAt}T12:00:00Z`).toISOString()
        await api.me.personalProgram.workouts.create({
          title: title.trim(),
          description: description.trim(),
          coachNotes: trimmedCoachNotes || undefined,
          type,
          scheduledAt: iso,
        })
      } else if (workoutId) {
        await api.workouts.update(workoutId, {
          title: title.trim(),
          description: description.trim(),
          coachNotes: trimmedCoachNotes === '' ? null : trimmedCoachNotes,
          type,
          timeCapSeconds,
        })
      }
      navigation.goBack()
    } catch (e) {
      const status = (e as { status?: number }).status
      const friendly =
        status === 403 ? "You don't have permission to edit this workout."
        : status === 404 ? 'This workout was deleted.'
        : e instanceof Error ? e.message
        : 'Failed to save workout'
      setError(friendly)
      setSubmitting(false)
    }
  }

  function handleDelete() {
    if (mode !== 'edit' || !workoutId || deleting) return
    Alert.alert(
      'Delete workout?',
      'This permanently removes the workout and any results logged against it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            setError(null)
            try {
              await api.workouts.delete(workoutId)
              navigation.goBack()
            } catch (e) {
              const status = (e as { status?: number }).status
              const friendly =
                status === 403 ? "You don't have permission to delete this workout."
                : status === 404 ? 'This workout was already deleted.'
                : e instanceof Error ? e.message
                : 'Failed to delete workout'
              setError(friendly)
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <ThemedView variant="screen" style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView variant="screen" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View>
              {scheduledAt && (
                <ThemedText style={styles.dayLabel}>{formatDayLabel(scheduledAt)}</ThemedText>
              )}
              <ThemedText variant="tertiary" style={styles.subtitle}>
                {mode === 'create'
                  ? 'Personal Program — only you will see this workout.'
                  : 'Edit workout — changes save when you tap Save.'}
              </ThemedText>
            </View>
          </TouchableWithoutFeedback>

          <ThemedText variant="label" style={styles.sectionLabel}>TITLE</ThemedText>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Easy Z2 row"
            placeholderTextColor={colors.textPlaceholder}
            maxLength={120}
            autoFocus={mode === 'create'}
            returnKeyType="next"
            testID="title-input"
          />

          <ThemedText variant="label" style={styles.sectionLabel}>DESCRIPTION</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.descriptionInput,
              { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder="Sets, reps, notes…"
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={5}
            testID="description-input"
          />

          {/* Coach notes — programmer-authored stimulus / teaching notes
              (#184). Shown for both gym and personal programs; on personal
              programs the user is their own coach so it's still useful for
              "remember to keep tempo on the second set" style asides. */}
          <ThemedText variant="label" style={styles.sectionLabel}>COACH NOTES (optional)</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.coachNotesInput,
              { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
            ]}
            value={coachNotes}
            onChangeText={setCoachNotes}
            placeholder="Cues, scaling notes, intent…"
            placeholderTextColor={colors.textPlaceholder}
            multiline
            numberOfLines={3}
            testID="coach-notes-input"
          />

          <ThemedText variant="label" style={styles.sectionLabel}>TYPE</ThemedText>
          {/* Single-row type selector — taps open a bottom-sheet picker so
              the form doesn't get blown out by a 5-category chip grid. The
              button shows the current selection with the type's accent bar
              along the left edge. Mirrors the web drawer's <select> in
              terms of saved real estate while staying native-feeling. */}
          <TouchableOpacity
            onPress={() => setTypePickerOpen(true)}
            style={[
              styles.typeSelectButton,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.borderInteractive,
                borderLeftColor: WORKOUT_TYPE_STYLES[type].accentBar,
              },
            ]}
            testID="type-select-button"
            accessibilityRole="button"
            accessibilityLabel={`Type: ${WORKOUT_TYPE_STYLES[type].label}. Tap to change.`}
          >
            <ThemedText style={styles.typeSelectLabel}>{WORKOUT_TYPE_STYLES[type].label}</ThemedText>
            <ThemedText variant="tertiary" style={styles.typeSelectChevron}>▾</ThemedText>
          </TouchableOpacity>

          {showTimeCap && (
            <>
              <ThemedText variant="label" style={styles.sectionLabel}>TIME CAP (mm:ss)</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.timeCapInput,
                  { backgroundColor: colors.inputBg, borderColor: timeCapInvalid ? colors.errorText : colors.borderInteractive, color: colors.textPrimary },
                ]}
                value={timeCapInput}
                onChangeText={setTimeCapInput}
                placeholder="e.g. 12:00"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="numbers-and-punctuation"
                testID="time-cap-input"
              />
              {timeCapInvalid && (
                <ThemedText style={[styles.error, { color: colors.errorText }]}>
                  Enter a time as mm:ss (e.g. 12:00) or seconds.
                </ThemedText>
              )}
            </>
          )}

          {error && <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary },
              !canSubmit && styles.submitBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!canSubmit}
            testID="save-button"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={[styles.submitBtnText, { color: '#fff' }]}>
                {mode === 'create' ? 'Save workout' : 'Save changes'}
              </ThemedText>
            )}
          </TouchableOpacity>

          {mode === 'edit' && (
            <TouchableOpacity
              style={[styles.deleteBtn, { borderColor: colors.errorText }]}
              onPress={handleDelete}
              disabled={deleting || submitting}
              testID="delete-button"
            >
              {deleting ? (
                <ActivityIndicator color={colors.errorText} />
              ) : (
                <ThemedText style={[styles.deleteBtnText, { color: colors.errorText }]}>
                  Delete workout
                </ThemedText>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            disabled={submitting || deleting}
          >
            <ThemedText variant="tertiary" style={styles.cancelBtnText}>Cancel</ThemedText>
          </TouchableOpacity>
        </ScrollView>

        {/* Type picker — bottom-sheet modal. Backdrop tap or Cancel closes;
            tapping a chip selects + closes in one gesture. Categories +
            chip layout match the original inline grid so legacy tests that
            tap `type-chip-<X>` still work. */}
        <Modal
          visible={typePickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setTypePickerOpen(false)}
        >
          <Pressable
            style={styles.typePickerBackdrop}
            onPress={() => setTypePickerOpen(false)}
            testID="type-picker-backdrop"
          >
            <Pressable
              style={[styles.typePickerSheet, { backgroundColor: colors.cardBg }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.typePickerHeader}>
                <ThemedText style={styles.typePickerTitle}>Workout type</ThemedText>
                <TouchableOpacity onPress={() => setTypePickerOpen(false)} testID="type-picker-close">
                  <ThemedText variant="tertiary" style={styles.typePickerClose}>Cancel</ThemedText>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.typePickerScroll}>
                {CATEGORY_ORDER.filter((c) => typesByCategory[c]?.length).map((category) => (
                  <View key={category} style={styles.categoryGroup}>
                    <ThemedText variant="muted" style={styles.categoryHeader}>{category.toUpperCase()}</ThemedText>
                    <View style={styles.chipRow}>
                      {typesByCategory[category].map((t) => {
                        const style = WORKOUT_TYPE_STYLES[t]
                        const selected = t === type
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => { setType(t); setTypePickerOpen(false) }}
                            style={[
                              styles.chip,
                              { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive },
                              selected && { backgroundColor: style.bgTint, borderColor: style.accentBar },
                            ]}
                            testID={`type-chip-${t}`}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={style.label}
                          >
                            <ThemedText
                              variant={selected ? 'primary' : 'tertiary'}
                              style={[styles.chipLabel, selected && { color: style.tint, fontWeight: '700' }]}
                            >
                              {style.label}
                            </ThemedText>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 48 },

  dayLabel: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 24 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  descriptionInput: { minHeight: 100, textAlignVertical: 'top' },
  coachNotesInput: { minHeight: 70, textAlignVertical: 'top' },
  timeCapInput: { maxWidth: 140 },

  // Type-selector single-row button — leading 4px accent bar tints to
  // match the selected type so the user gets a visual cue without opening
  // the picker.
  typeSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  typeSelectLabel: { fontSize: 15, fontWeight: '500' },
  typeSelectChevron: { fontSize: 14 },

  // Bottom-sheet modal for the type picker.
  typePickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  typePickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  typePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  typePickerTitle: { fontSize: 16, fontWeight: '600' },
  typePickerClose: { fontSize: 15 },
  typePickerScroll: { paddingTop: 4 },

  categoryList: { marginTop: 4 },
  categoryGroup: { marginBottom: 12 },
  categoryHeader: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 13 },

  error: { fontSize: 13, marginTop: 16 },

  submitBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '600' },

  deleteBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600' },

  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { fontSize: 14 },

  headerDoneBtn: { paddingHorizontal: 12, paddingVertical: 6, marginRight: 4 },
  headerDoneText: { fontSize: 15, fontWeight: '600' },
})
