import { useEffect, useMemo, useRef, useState } from 'react'
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
import { api, type Movement, type Workout, type WorkoutType } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'
import { useTheme } from '../lib/theme'
import { useMovements } from '../context/MovementsContext'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = StackScreenProps<RootStackParamList, 'WorkoutEditor'>

// Mirrors `TIME_CAP_TYPES` in apps/web/src/components/WorkoutDrawer.tsx —
// these categories surface a workout-level time cap input. Strength,
// Skill Work, and Warmup-Recovery hide the field.
const TIME_CAP_TYPES = new Set<WorkoutType>([
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
])

// Autosave debounce. Slightly tighter than web's 2s — phones often have
// flakier connections so a faster nudge feels more responsive without
// drowning the keyboard in requests.
const AUTOSAVE_DEBOUNCE_MS = 1500
// Movement-detect debounce. Matches web's 800ms (apps/web/src/components/
// WorkoutDrawer.tsx) so the suggestion latency feels equivalent on both
// surfaces. Detection produces *suggestions*, not auto-tags — the user
// accepts each one with the ✓ button.
const MOVEMENT_DETECT_DEBOUNCE_MS = 800
// Same content thresholds as web (apps/web/src/components/WorkoutDrawer.tsx)
// — keeps an idle tap-then-cancel from creating an empty draft on the server.
const AUTOSAVE_MIN_TITLE = 3
const AUTOSAVE_MIN_DESCRIPTION = 5

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

  // Autosave state. `localWorkoutId` is set after the first successful
  // create-mode autosave (or pre-populated from the route param in edit
  // mode); from there every subsequent autosave PATCHes that id rather
  // than POSTing a new draft. `lastSnapshotRef` tracks what was last sent
  // to the server so we can skip no-op writes on every keystroke.
  const [localWorkoutId, setLocalWorkoutId] = useState<string | null>(
    mode === 'edit' ? (workoutId ?? null) : null,
  )
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSnapshotRef = useRef<string | null>(null)

  // Movement state (slice 3a). `selectedMovements` is what the workout
  // ships with — order matters (display order on the result form). Server
  // detect populates `suggestedMovementIds`; the user accepts each pill
  // explicitly to add to selectedMovements, or dismisses to drop the
  // suggestion. `dismissedIds` keeps the suggestion from re-appearing on
  // the next detect tick after the user explicitly said no.
  const allMovements = useMovements()
  const [selectedMovements, setSelectedMovements] = useState<Movement[]>([])
  const [suggestedMovementIds, setSuggestedMovementIds] = useState<string[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

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
        // Hydrate the movement list from the workout's existing per-movement
        // rows (already display-ordered server-side). Slice 3a only round-trips
        // the ids; per-movement prescription still lives in slice 3b.
        const hydratedMovements = (w.workoutMovements ?? []).map((wm) => wm.movement)
        setSelectedMovements(hydratedMovements)
        setLoading(false)
        navigation.setOptions({ title: 'Edit Workout' })
        // Seed the autosave baseline with what we just loaded so the
        // hydrate-from-server pass doesn't trigger an immediate PATCH.
        lastSnapshotRef.current = JSON.stringify({
          title: w.title,
          description: w.description,
          coachNotes: (w.coachNotes ?? '').trim(),
          type: w.type,
          timeCapSeconds: w.timeCapSeconds,
          movementIds: hydratedMovements.map((m) => m.id),
        })
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

  // ── Autosave ─────────────────────────────────────────────────────────────
  // Debounced background save of the form state. Skips when:
  //  - edit mode hasn't hydrated yet (loading)
  //  - title or description hasn't reached the minimum length (avoids
  //    creating empty drafts when the user opens the editor and immediately
  //    bails)
  //  - time-cap is malformed
  //  - a manual Save / Delete is in flight
  //  - the snapshot hasn't actually changed since the last successful save
  //
  // First create-mode autosave POSTs; the resulting id is stashed in
  // `localWorkoutId` so every keystroke after that PATCHes the same row,
  // matching the web drawer's create→update transition.
  const timeCapForSave = !showTimeCap ? null : parsedTimeCap ?? null
  const trimmedCoachNotesForSave = coachNotes.trim()
  // Materialise the movement-id list for the snapshot + payloads. Order
  // matters — `displayOrder` flows from this array.
  const movementIdsForSave = useMemo(
    () => selectedMovements.map((m) => m.id),
    [selectedMovements],
  )
  const snapshot = useMemo(
    () => JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      coachNotes: trimmedCoachNotesForSave,
      type,
      timeCapSeconds: timeCapForSave,
      movementIds: movementIdsForSave,
    }),
    [title, description, trimmedCoachNotesForSave, type, timeCapForSave, movementIdsForSave],
  )

  useEffect(() => {
    if (loading) return
    if (submitting || deleting) return
    if (timeCapInvalid) return
    if (title.trim().length < AUTOSAVE_MIN_TITLE) return
    if (description.trim().length < AUTOSAVE_MIN_DESCRIPTION) return
    if (snapshot === lastSnapshotRef.current) return

    const handle = setTimeout(async () => {
      setAutosaveStatus('saving')
      try {
        if (localWorkoutId) {
          await api.workouts.update(localWorkoutId, {
            title: title.trim(),
            description: description.trim(),
            coachNotes: trimmedCoachNotesForSave === '' ? null : trimmedCoachNotesForSave,
            type,
            timeCapSeconds: timeCapForSave,
            movementIds: movementIdsForSave,
          })
        } else if (mode === 'create' && scheduledAt) {
          // Create mode + first autosave: POST a draft pinned to the chosen
          // calendar day, then upgrade the row's id so subsequent autosaves
          // PATCH it instead of POSTing again.
          const iso = new Date(`${scheduledAt}T12:00:00Z`).toISOString()
          const created = await api.me.personalProgram.workouts.create({
            title: title.trim(),
            description: description.trim(),
            coachNotes: trimmedCoachNotesForSave || undefined,
            type,
            scheduledAt: iso,
            movementIds: movementIdsForSave,
          })
          setLocalWorkoutId(created.id)
        } else {
          return
        }
        lastSnapshotRef.current = snapshot
        setAutosaveStatus('saved')
      } catch {
        setAutosaveStatus('error')
      }
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [snapshot, loading, submitting, deleting, timeCapInvalid, title, description, trimmedCoachNotesForSave, type, timeCapForSave, movementIdsForSave, localWorkoutId, mode, scheduledAt])

  // ── Movement detect ──────────────────────────────────────────────────────
  // Debounced suggest-from-description. Skips when:
  //  - editor is still hydrating (loading)
  //  - description is blank or below 1 char (no signal to detect against)
  //  - the movements catalog hasn't loaded yet (no labels to render against)
  //
  // Detection produces *suggestions*, not auto-tags — the user accepts each
  // pill explicitly to add to selectedMovements, or dismisses to drop it
  // from the next detect tick. Mirrors the web drawer's pattern exactly.
  useEffect(() => {
    if (loading) return
    if (!description.trim()) {
      setSuggestedMovementIds([])
      return
    }
    if (allMovements.length === 0) return

    const handle = setTimeout(() => {
      api.movements.detect(description)
        .then((detected) => {
          // Filter out anything already selected or explicitly dismissed —
          // suggestions should only surface new options the user hasn't
          // weighed in on yet.
          const selectedIds = new Set(selectedMovements.map((m) => m.id))
          const fresh = detected
            .filter((m) => !selectedIds.has(m.id) && !dismissedIds.has(m.id))
            .map((m) => m.id)
          setSuggestedMovementIds(fresh)
        })
        .catch(() => {})
    }, MOVEMENT_DETECT_DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // selectedMovements + dismissedIds are intentionally read at debounce
    // tick time only — including them in deps would re-fire detect on every
    // accept/dismiss, hammering the API for no new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, loading, allMovements.length])

  function acceptSuggestion(id: string) {
    const movement = allMovements.find((m) => m.id === id)
    if (!movement) return
    setSelectedMovements((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, movement]))
    setSuggestedMovementIds((prev) => prev.filter((sid) => sid !== id))
  }

  function dismissSuggestion(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setSuggestedMovementIds((prev) => prev.filter((sid) => sid !== id))
  }

  function removeSelectedMovement(id: string) {
    setSelectedMovements((prev) => prev.filter((m) => m.id !== id))
    // Drop from dismissed too so a future detect re-suggests it if the
    // user removed it by accident.
    setDismissedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleSave() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // Empty coach notes = explicit clear on edit (server schema accepts
      // null), or "don't send the field" on create (the server treats absent
      // as null too — both yield the same persisted state).
      const trimmedCoachNotes = coachNotes.trim()

      // If autosave already POSTed (or we're in edit mode), prefer PATCH on
      // the known id so we don't create a duplicate draft. Falls back to POST
      // only when we have nothing on the server yet.
      if (localWorkoutId) {
        await api.workouts.update(localWorkoutId, {
          title: title.trim(),
          description: description.trim(),
          coachNotes: trimmedCoachNotes === '' ? null : trimmedCoachNotes,
          type,
          timeCapSeconds: timeCapForSave,
          movementIds: movementIdsForSave,
        })
      } else if (mode === 'create' && scheduledAt) {
        // YYYY-MM-DD → noon UTC so the workout lands on the same calendar
        // date for every viewer (matches the autosave create path + web).
        const iso = new Date(`${scheduledAt}T12:00:00Z`).toISOString()
        await api.me.personalProgram.workouts.create({
          title: title.trim(),
          description: description.trim(),
          coachNotes: trimmedCoachNotes || undefined,
          type,
          scheduledAt: iso,
          movementIds: movementIdsForSave,
        })
      }
      lastSnapshotRef.current = snapshot
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
    // Allow delete in edit mode AND in create mode after autosave has
    // landed a draft (so a user who tapped into the editor and started
    // typing can back out of the draft cleanly).
    const idToDelete = mode === 'edit' ? workoutId : localWorkoutId
    if (!idToDelete || deleting) return
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
              await api.workouts.delete(idToDelete)
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

          {/* Movements (slice 3a) — selected pills with × remove, plus
              "Suggestions" pills with ✓ accept / × dismiss when the detect
              effect surfaces matches from the description. Per-movement
              prescription editing is deferred to slice 3b. */}
          <ThemedText variant="label" style={styles.sectionLabel}>MOVEMENTS</ThemedText>
          {selectedMovements.length === 0 ? (
            <ThemedText variant="tertiary" style={styles.movementsEmpty}>
              Type movements into the description above — we'll suggest matches below.
            </ThemedText>
          ) : (
            <View style={styles.movementChipRow} testID="selected-movements">
              {selectedMovements.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.movementChip,
                    { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  ]}
                  testID={`selected-movement-${m.id}`}
                >
                  <ThemedText style={styles.movementChipLabel}>{m.name}</ThemedText>
                  <TouchableOpacity
                    onPress={() => removeSelectedMovement(m.id)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.name}`}
                    testID={`selected-movement-remove-${m.id}`}
                  >
                    <ThemedText variant="tertiary" style={styles.movementChipDismiss}>×</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {suggestedMovementIds.length > 0 && (
            <>
              <ThemedText variant="muted" style={styles.suggestionsHeader}>
                SUGGESTIONS — tap ✓ to add, × to dismiss
              </ThemedText>
              <View style={styles.movementChipRow} testID="suggested-movements">
                {suggestedMovementIds.map((id) => {
                  const m = allMovements.find((x) => x.id === id)
                  if (!m) return null
                  return (
                    <View
                      key={id}
                      style={[
                        styles.movementChip,
                        // Brand-tinted background to read as actionable rather than
                        // committed; selected pills use the neutral cardBg above.
                        { backgroundColor: colors.cardBg, borderColor: colors.primary, borderStyle: 'dashed' },
                      ]}
                      testID={`suggested-movement-${id}`}
                    >
                      <ThemedText style={styles.movementChipLabel}>{m.name}</ThemedText>
                      <TouchableOpacity
                        onPress={() => acceptSuggestion(id)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${m.name}`}
                        testID={`suggested-movement-accept-${id}`}
                      >
                        <ThemedText style={[styles.movementChipAccept, { color: colors.primary }]}>✓</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => dismissSuggestion(id)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Dismiss ${m.name}`}
                        testID={`suggested-movement-dismiss-${id}`}
                      >
                        <ThemedText variant="tertiary" style={styles.movementChipDismiss}>×</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>
            </>
          )}

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

          {/* Subtle autosave indicator above the manual Save button so users
              know their work is being persisted in the background. Hidden
              while idle to avoid noise on a fresh form. */}
          {autosaveStatus !== 'idle' && (
            <ThemedText
              variant="tertiary"
              style={[
                styles.autosaveStatus,
                autosaveStatus === 'error' && { color: colors.errorText },
              ]}
              testID="autosave-status"
            >
              {autosaveStatus === 'saving' && 'Autosaving…'}
              {autosaveStatus === 'saved' && 'Saved'}
              {autosaveStatus === 'error' && 'Autosave failed — try Save'}
            </ThemedText>
          )}

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

          {(mode === 'edit' || localWorkoutId) && (
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

  // Movement chips — selected (solid border) vs suggested (dashed brand border).
  movementsEmpty: { fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  movementChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  movementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
  },
  movementChipLabel: { fontSize: 13 },
  movementChipAccept: { fontSize: 16, fontWeight: '700' },
  movementChipDismiss: { fontSize: 18, lineHeight: 18 },
  suggestionsHeader: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 12, marginBottom: 4 },

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

  autosaveStatus: { fontSize: 12, marginTop: 16, textAlign: 'center' },

  submitBtn: { paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
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
