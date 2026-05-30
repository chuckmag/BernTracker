import { useEffect, useState } from 'react'
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import {
  api,
  type GoalResponse,
  type GoalType,
  type TargetPrType,
  type CreateGoalInput,
} from '../lib/api'
import { useMovements } from '../context/MovementsContext'
import { useTheme, type ThemeColors } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

// ─── Shared field types ─────────────────────────────────────────────────────────

const TYPE_LABELS: Record<GoalType, string> = {
  PR_TARGET: 'PR Target',
  FREQUENCY: 'Frequency',
  HABIT: 'Habit',
}

const PR_TYPE_LABELS: Record<TargetPrType, string> = {
  LOAD: 'Load',
  MAX_REPS: 'Max Reps',
  TIME: 'Time',
  DISTANCE: 'Distance',
  CALORIES: 'Calories',
}

// SMART hint copy — kept in sync with the web's GoalForm.
export const SMART_HINT_COPY =
  "Goals are easier to achieve when they're time-bound. Consider adding a target date — it's the T in SMART (Specific, Measurable, Achievable, Relevant, Time-bound)."

// "Daily check-ins coming in v2" — shared between the create form and the
// Habit detail screen so the wording stays consistent.
export const HABIT_V2_COPY = 'Daily check-ins coming in v2.'

// Edit-mode banner: PATCH /api/goals/:id only accepts { title, targetDate,
// status } (see apps/api/src/routes/goals.ts → UpdateGoalSchema). Surface
// that constraint so users don't try to change the target value or PR type
// inline.
const EDIT_LOCKED_COPY =
  'Edit only changes the title and target date. To change the target value, type, or frequency, delete this goal and recreate it.'

// Reusable input/select style builder — every TextInput and select button in
// this form needs the same theme-aware bg/border/text triple.
function inputStyle(colors: ThemeColors) {
  return {
    backgroundColor: colors.inputBg,
    borderColor: colors.borderInteractive,
    color: colors.textPrimary,
  }
}

// ─── Picker bottom sheets ──────────────────────────────────────────────────────

interface OptionSheetProps<T extends string> {
  visible: boolean
  title: string
  options: { value: T; label: string }[]
  selectedValue: T | null
  onSelect: (value: T) => void
  onClose: () => void
}

function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: OptionSheetProps<T>) {
  const { colors } = useTheme()
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <ThemedView variant="card" style={s.sheet}>
            <ThemedText style={s.sheetTitle}>{title}</ThemedText>
            <ScrollView style={s.sheetScroll}>
              {options.map((opt) => {
                const isSel = opt.value === selectedValue
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.sheetRow, { borderBottomColor: colors.borderSubtle }]}
                    onPress={() => {
                      onSelect(opt.value)
                      onClose()
                    }}
                  >
                    <ThemedText
                      variant="secondary"
                      style={[s.sheetRowText, isSel && { color: colors.primary, fontWeight: '600' }]}
                    >
                      {opt.label}
                    </ThemedText>
                    {isSel && <ThemedText style={[s.sheetCheck, { color: colors.primary }]}>✓</ThemedText>}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Inline typeahead combo ────────────────────────────────────────────────────
//
// The movement and named-workout pickers previously opened a full-screen
// `Modal`. That modal sat on top of the soft keyboard and pushed the filtered
// results below the keyboard line, so as the user typed and the list shrunk
// the visible results disappeared behind the keyboard. Replaced with this
// inline combo: a single TextInput inside the parent form's
// KeyboardAvoidingView + ScrollView, with the top-3 matches rendered as a
// small dropdown directly below the field. The dropdown rides up with the
// keyboard for free (it's part of the same scroll surface).
//
// Behaviour:
//   - When a value is selected and the input text matches its name, the
//     dropdown stays hidden — the field reads as a "chosen value" state.
//   - As soon as the user types something that doesn't match the selected
//     name, the selection clears (so submit-time validation catches "user
//     typed but didn't pick") and the top-3 matches appear.
//   - Tapping a match populates the input with its name, fires `onSelect`,
//     and dismisses the dropdown.

interface InlineComboOption { id: string; name: string }

interface InlineComboProps {
  options: InlineComboOption[]
  selectedId: string | null
  selectedName: string | null
  onSelect: (option: InlineComboOption | null) => void
  placeholder: string
  emptyText: string
  accessibilityLabel: string
}

function InlineCombo({
  options,
  selectedId,
  selectedName,
  onSelect,
  placeholder,
  emptyText,
  accessibilityLabel,
}: InlineComboProps) {
  const { colors } = useTheme()
  const [text, setText] = useState(selectedName ?? '')

  // Keep the input in sync if the parent's selection changes externally
  // (e.g. initial form load for edit mode, or a programmatic reset).
  useEffect(() => {
    if (selectedName !== null) setText(selectedName)
  }, [selectedName])

  const trimmed = text.trim()
  // Open the dropdown whenever there's typed text that doesn't equal the
  // current selection's name. No focus tracking — the parent ScrollView's
  // `keyboardShouldPersistTaps="handled"` keeps row taps from being eaten
  // by a blur event, and the dropdown auto-dismisses the moment a pick
  // brings `text` back into agreement with `selectedName`.
  const matchesSelected = selectedName !== null && trimmed === selectedName
  const dropdownOpen = trimmed.length > 0 && !matchesSelected
  const matches = dropdownOpen
    ? options
        .filter((o) => o.name.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 3)
    : []

  function handleChange(next: string) {
    setText(next)
    // The user is editing — anything they typed that isn't an exact match
    // of the current selection invalidates that selection. The save path
    // requires a re-pick from the dropdown.
    if (selectedId !== null && next !== selectedName) onSelect(null)
  }

  function handlePick(option: InlineComboOption) {
    // Idempotent — safe to fire repeatedly. The dropdown row can briefly
    // receive both onPressIn and onPress in rare timing windows; this
    // guard keeps the parent's state-update count to one.
    if (selectedId === option.id) return
    setText(option.name)
    onSelect(option)
  }

  return (
    <View>
      <TextInput
        style={[s.input, inputStyle(colors)]}
        value={text}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {dropdownOpen && (
        <View style={[s.comboDropdown, { backgroundColor: colors.inputBg, borderColor: colors.borderSubtle }]}>
          {matches.length === 0 ? (
            <ThemedText variant="tertiary" style={s.comboEmpty}>{emptyText}</ThemedText>
          ) : (
            matches.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[s.comboRow, { borderBottomColor: colors.borderSubtle }]}
                // onPressIn (touch-down) instead of onPress (touch-up):
                // when the soft keyboard is up and the user taps a row,
                // RN dispatches the keyboard's blur handler on touch-up.
                // With onPress the first tap would dismiss the keyboard
                // and never reach the row's handler — requiring a second
                // tap to actually select. Firing on touch-down commits
                // the selection before the blur cycle starts, so the
                // keyboard dismisses *after* the row is selected, which
                // is the intended UX (selection done → input loses focus).
                onPressIn={() => handlePick(opt)}
                accessibilityLabel={`Select ${opt.name}`}
              >
                <ThemedText style={s.comboRowText}>{opt.name}</ThemedText>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </View>
  )
}

// ─── Main form ─────────────────────────────────────────────────────────────────

interface Props {
  mode: 'create' | 'edit'
  initialGoal?: GoalResponse
  onCancel: () => void
  onSaved: (goal: GoalResponse) => void
}

type Subject = 'movement' | 'namedWorkout'

export default function GoalFormModal({ mode, initialGoal, onCancel, onSaved }: Props) {
  const { colors, isDark } = useTheme()
  const movements = useMovements()

  // Type — only mutable in create mode.
  const [type, setType] = useState<GoalType>(initialGoal?.type ?? 'PR_TARGET')
  const [typeSheet, setTypeSheet] = useState(false)
  const [title, setTitle] = useState(initialGoal?.title ?? '')

  // Date
  const [targetDate, setTargetDate] = useState<Date | null>(
    initialGoal?.targetDate ? new Date(initialGoal.targetDate) : null,
  )
  const [showAndroidPicker, setShowAndroidPicker] = useState(false)

  // PR Target fields
  const [subject, setSubject] = useState<Subject>(
    initialGoal?.namedWorkoutId ? 'namedWorkout' : 'movement',
  )
  const [movementId, setMovementId] = useState<string | null>(initialGoal?.movementId ?? null)
  const [namedWorkout, setNamedWorkout] = useState<{ id: string; name: string } | null>(
    initialGoal?.namedWorkout ?? null,
  )
  const [namedWorkouts, setNamedWorkouts] = useState<{ id: string; name: string }[]>([])
  const [targetPrType, setTargetPrType] = useState<TargetPrType>(
    (initialGoal?.targetPrType as TargetPrType | null | undefined) ?? 'LOAD',
  )
  const [prTypeSheet, setPrTypeSheet] = useState(false)
  const [targetValue, setTargetValue] = useState(
    initialGoal?.targetValue !== null && initialGoal?.targetValue !== undefined
      ? String(initialGoal.targetValue)
      : '',
  )
  const [targetRepCount, setTargetRepCount] = useState(
    initialGoal?.targetRepCount != null ? String(initialGoal.targetRepCount) : '1',
  )
  const [targetLoadUnit, setTargetLoadUnit] = useState<'LB' | 'KG'>(
    initialGoal?.targetLoadUnit ?? 'LB',
  )

  // Frequency fields
  const [frequencyPerWeek, setFrequencyPerWeek] = useState(
    initialGoal?.frequencyPerWeek != null ? String(initialGoal.frequencyPerWeek) : '3',
  )
  const [frequencyWeeks, setFrequencyWeeks] = useState(
    initialGoal?.frequencyWeeks != null ? String(initialGoal.frequencyWeeks) : '4',
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedMovement = movements.find((m) => m.id === movementId) ?? null

  useEffect(() => {
    // Load named-workout picker options lazily — only relevant for PR Target.
    if (type !== 'PR_TARGET') return
    if (subject !== 'namedWorkout') return
    if (namedWorkouts.length > 0) return
    api.namedWorkouts.list()
      .then((list) => setNamedWorkouts(list.map((nw) => ({ id: nw.id, name: nw.name }))))
      .catch(() => {})
  }, [type, subject, namedWorkouts.length])

  function validate(): string | null {
    if (!title.trim()) return 'Title is required'
    // PATCH only touches title + targetDate, so per-type field validation is
    // skipped in edit mode — otherwise a goal whose PR-target fields are
    // missing in local state (or whose original input drifted) would block
    // a valid title edit.
    if (mode === 'edit') return null
    if (type === 'PR_TARGET') {
      if (subject === 'movement' && !movementId) return 'Pick a movement'
      if (subject === 'namedWorkout' && !namedWorkout) return 'Pick a named workout'
      const v = Number(targetValue)
      if (!Number.isFinite(v) || v <= 0) return 'Enter a positive target value'
      if (targetPrType === 'LOAD') {
        const rc = Number(targetRepCount)
        if (!Number.isInteger(rc) || rc <= 0) return 'Enter a positive rep count'
      }
    }
    if (type === 'FREQUENCY') {
      const per = Number(frequencyPerWeek)
      const wks = Number(frequencyWeeks)
      if (!Number.isInteger(per) || per < 1 || per > 14) return 'Workouts per week must be 1–14'
      if (!Number.isInteger(wks) || wks < 1 || wks > 52) return 'Weeks must be 1–52'
    }
    return null
  }

  async function handleSave() {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const targetDateIso = targetDate ? targetDate.toISOString() : undefined

      if (mode === 'create') {
        let input: CreateGoalInput
        if (type === 'PR_TARGET') {
          // Set targetLoadUnit / targetRepCount as conditional `undefined`
          // instead of a conditional spread. TS narrows the
          // discriminated-union literal correctly through optional fields
          // but not through `...(cond ? {...} : {})`, which is what forced
          // the `as CreateGoalInput` cast previously.
          input = {
            type: 'PR_TARGET',
            title: title.trim(),
            targetDate: targetDateIso,
            movementId: subject === 'movement' ? (movementId ?? undefined) : undefined,
            namedWorkoutId: subject === 'namedWorkout' ? (namedWorkout?.id ?? undefined) : undefined,
            targetPrType,
            targetValue: Number(targetValue),
            targetLoadUnit: targetPrType === 'LOAD' ? targetLoadUnit : undefined,
            targetRepCount: targetPrType === 'LOAD' ? Number(targetRepCount) : undefined,
          }
        } else if (type === 'FREQUENCY') {
          input = {
            type: 'FREQUENCY',
            title: title.trim(),
            targetDate: targetDateIso,
            frequencyPerWeek: Number(frequencyPerWeek),
            frequencyWeeks: Number(frequencyWeeks),
          }
        } else {
          input = {
            type: 'HABIT',
            title: title.trim(),
            targetDate: targetDateIso,
          }
        }
        const created = await api.users.me.goals.create(input)
        onSaved(created)
      } else {
        // Edit: only title + targetDate (per UpdateGoalSchema).
        if (!initialGoal) throw new Error('Missing initialGoal for edit mode')
        const updated = await api.users.me.goals.update(initialGoal.id, {
          title: title.trim(),
          targetDate: targetDate ? targetDate.toISOString() : null,
        })
        onSaved(updated)
      }
    } catch (e) {
      Alert.alert('Could not save goal', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const showSmartHint = !targetDate
  const inputThemed = inputStyle(colors)

  // Chip styles — active chips use the saturated primary, inactive ones match
  // the input style. Mirrors the previous indigo treatment for the active
  // state with the new tokens.
  const chipBase = [s.subjectChip, { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive }]
  const chipActive = { backgroundColor: colors.primary, borderColor: colors.primaryHover }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={s.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ThemedView variant="card" style={s.sheetMain}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText style={s.title}>{mode === 'create' ? 'New goal' : 'Edit goal'}</ThemedText>

            {/* Type — locked in edit mode */}
            <ThemedText variant="label" style={s.fieldLabel}>TYPE</ThemedText>
            <TouchableOpacity
              style={[s.selectBtn, inputThemed, mode === 'edit' && s.selectBtnDisabled]}
              disabled={mode === 'edit'}
              onPress={() => setTypeSheet(true)}
              accessibilityLabel="Goal type"
            >
              <ThemedText style={s.selectBtnText}>{TYPE_LABELS[type]}</ThemedText>
              {mode === 'create' && <ThemedText style={[s.selectBtnChevron, { color: colors.primary }]}>▾</ThemedText>}
            </TouchableOpacity>

            {/* Title */}
            <ThemedText variant="label" style={s.fieldLabel}>TITLE</ThemedText>
            <TextInput
              style={[s.input, inputThemed]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. 315 lb back squat"
              placeholderTextColor={colors.textPlaceholder}
              accessibilityLabel="Goal title"
            />

            {/* In edit mode, target values / type / cadence are immutable
                (see UpdateGoalSchema in apps/api/src/routes/goals.ts).
                Hide the per-type editors to make that obvious instead of
                rendering them and silently dropping the changes on save. */}
            {mode === 'edit' && (
              <View
                style={[
                  s.editLockedBanner,
                  { backgroundColor: `${colors.primary}1a`, borderColor: colors.borderInteractive },
                ]}
                accessibilityLabel="Edit locked notice"
              >
                <ThemedText variant="secondary" style={s.editLockedText}>{EDIT_LOCKED_COPY}</ThemedText>
              </View>
            )}

            {/* PR Target subform */}
            {mode === 'create' && type === 'PR_TARGET' && (
              <>
                <ThemedText variant="label" style={s.fieldLabel}>SUBJECT</ThemedText>
                <View style={s.subjectRow}>
                  <TouchableOpacity
                    style={[...chipBase, subject === 'movement' && chipActive]}
                    onPress={() => setSubject('movement')}
                  >
                    <ThemedText
                      variant={subject === 'movement' ? 'primary' : 'tertiary'}
                      style={[s.subjectChipText, subject === 'movement' && { color: colors.onPrimary, fontWeight: '600' }]}
                    >
                      Movement
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[...chipBase, subject === 'namedWorkout' && chipActive]}
                    onPress={() => setSubject('namedWorkout')}
                  >
                    <ThemedText
                      variant={subject === 'namedWorkout' ? 'primary' : 'tertiary'}
                      style={[s.subjectChipText, subject === 'namedWorkout' && { color: colors.onPrimary, fontWeight: '600' }]}
                    >
                      Named workout
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                {subject === 'movement' && (
                  <InlineCombo
                    options={movements.map((m) => ({ id: m.id, name: m.name }))}
                    selectedId={movementId}
                    selectedName={selectedMovement?.name ?? null}
                    onSelect={(opt) => setMovementId(opt?.id ?? null)}
                    placeholder="Search movements…"
                    emptyText="No movements match"
                    accessibilityLabel="Choose movement"
                  />
                )}
                {subject === 'namedWorkout' && (
                  <InlineCombo
                    options={namedWorkouts}
                    selectedId={namedWorkout?.id ?? null}
                    selectedName={namedWorkout?.name ?? null}
                    onSelect={(opt) => setNamedWorkout(opt)}
                    placeholder="Search named workouts…"
                    emptyText="No named workouts match"
                    accessibilityLabel="Choose named workout"
                  />
                )}

                <ThemedText variant="label" style={s.fieldLabel}>PR TYPE</ThemedText>
                <TouchableOpacity style={[s.selectBtn, inputThemed]} onPress={() => setPrTypeSheet(true)}>
                  <ThemedText style={s.selectBtnText}>{PR_TYPE_LABELS[targetPrType]}</ThemedText>
                  <ThemedText style={[s.selectBtnChevron, { color: colors.primary }]}>▾</ThemedText>
                </TouchableOpacity>

                <ThemedText variant="label" style={s.fieldLabel}>TARGET VALUE</ThemedText>
                <TextInput
                  style={[s.input, inputThemed]}
                  value={targetValue}
                  onChangeText={setTargetValue}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 315"
                  placeholderTextColor={colors.textPlaceholder}
                  accessibilityLabel="Target value"
                />

                {targetPrType === 'LOAD' && (
                  <>
                    <ThemedText variant="label" style={s.fieldLabel}>REP COUNT</ThemedText>
                    <TextInput
                      style={[s.input, inputThemed]}
                      value={targetRepCount}
                      onChangeText={setTargetRepCount}
                      keyboardType="number-pad"
                      placeholder="e.g. 1 for 1RM"
                      placeholderTextColor={colors.textPlaceholder}
                      accessibilityLabel="Rep count"
                    />

                    <ThemedText variant="label" style={s.fieldLabel}>UNIT</ThemedText>
                    <View style={s.unitRow}>
                      {(['LB', 'KG'] as const).map((u) => (
                        <TouchableOpacity
                          key={u}
                          style={[...chipBase, targetLoadUnit === u && chipActive]}
                          onPress={() => setTargetLoadUnit(u)}
                        >
                          <ThemedText
                            variant={targetLoadUnit === u ? 'primary' : 'tertiary'}
                            style={[s.subjectChipText, targetLoadUnit === u && { color: colors.onPrimary, fontWeight: '600' }]}
                          >
                            {u}
                          </ThemedText>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}

            {/* Frequency subform */}
            {mode === 'create' && type === 'FREQUENCY' && (
              <>
                <ThemedText variant="label" style={s.fieldLabel}>WORKOUTS PER WEEK</ThemedText>
                <TextInput
                  style={[s.input, inputThemed]}
                  value={frequencyPerWeek}
                  onChangeText={setFrequencyPerWeek}
                  keyboardType="number-pad"
                  placeholder="3"
                  placeholderTextColor={colors.textPlaceholder}
                  accessibilityLabel="Workouts per week"
                />

                <ThemedText variant="label" style={s.fieldLabel}>WEEKS</ThemedText>
                <TextInput
                  style={[s.input, inputThemed]}
                  value={frequencyWeeks}
                  onChangeText={setFrequencyWeeks}
                  keyboardType="number-pad"
                  placeholder="4"
                  placeholderTextColor={colors.textPlaceholder}
                  accessibilityLabel="Weeks"
                />
              </>
            )}

            {/* Habit subform */}
            {mode === 'create' && type === 'HABIT' && (
              <View style={[s.habitNote, { backgroundColor: colors.inputBg }]}>
                <ThemedText variant="tertiary" style={s.habitNoteText}>{HABIT_V2_COPY}</ThemedText>
              </View>
            )}

            {/* Target date — common to all */}
            <ThemedText variant="label" style={s.fieldLabel}>TARGET DATE (OPTIONAL)</ThemedText>
            {Platform.OS === 'ios' ? (
              <View style={s.dateRow}>
                <DateTimePicker
                  value={targetDate ?? new Date()}
                  mode="date"
                  display="default"
                  themeVariant={isDark ? 'dark' : 'light'}
                  onChange={(_, date) => {
                    if (date) setTargetDate(date)
                  }}
                />
                {targetDate && (
                  <TouchableOpacity
                    onPress={() => setTargetDate(null)}
                    accessibilityLabel="Clear target date"
                  >
                    <ThemedText style={[s.clearBtn, { color: colors.primary }]}>Clear</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={s.dateRow}>
                <TouchableOpacity
                  style={[s.androidDateBtn, { backgroundColor: colors.inputBg }]}
                  onPress={() => setShowAndroidPicker(true)}
                >
                  <ThemedText style={s.androidDateBtnText}>
                    {targetDate
                      ? targetDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Pick a date'}
                  </ThemedText>
                </TouchableOpacity>
                {targetDate && (
                  <TouchableOpacity onPress={() => setTargetDate(null)}>
                    <ThemedText style={[s.clearBtn, { color: colors.primary }]}>Clear</ThemedText>
                  </TouchableOpacity>
                )}
                {showAndroidPicker && (
                  <DateTimePicker
                    value={targetDate ?? new Date()}
                    mode="date"
                    display="default"
                    onChange={(_, date) => {
                      setShowAndroidPicker(false)
                      if (date) setTargetDate(date)
                    }}
                  />
                )}
              </View>
            )}

            {showSmartHint && (
              <View
                style={[
                  s.smartHint,
                  { backgroundColor: `${colors.primary}1a`, borderLeftColor: colors.primary },
                ]}
                accessibilityLabel="SMART goal hint"
              >
                <ThemedText variant="secondary" style={s.smartHintText}>{SMART_HINT_COPY}</ThemedText>
              </View>
            )}

            {error && (
              <View style={s.errorRow}>
                <ThemedText style={[s.errorText, { color: colors.errorText }]}>{error}</ThemedText>
              </View>
            )}
          </ScrollView>

          <View style={[s.actions, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={[s.cancelBtn, { backgroundColor: colors.borderSubtle }]}
              onPress={onCancel}
              disabled={saving}
            >
              <ThemedText variant="tertiary" style={s.cancelBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: colors.primary }, saving && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <ThemedText style={[s.saveBtnText, { color: colors.onPrimary }]}>
                  {mode === 'create' ? 'Create' : 'Save'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </ThemedView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={typeSheet}
        title="Goal type"
        options={(['PR_TARGET', 'FREQUENCY', 'HABIT'] as GoalType[]).map((t) => ({
          value: t,
          label: TYPE_LABELS[t],
        }))}
        selectedValue={type}
        onSelect={setType}
        onClose={() => setTypeSheet(false)}
      />

      <OptionSheet
        visible={prTypeSheet}
        title="PR type"
        options={(['LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES'] as TargetPrType[]).map((p) => ({
          value: p,
          label: PR_TYPE_LABELS[p],
        }))}
        selectedValue={targetPrType}
        onSelect={setTargetPrType}
        onClose={() => setPrTypeSheet(false)}
      />

    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
//
// Module-level static styles. Theme-dependent backgrounds, borders, and
// foreground colors are layered on inline via useTheme() — see
// apps/mobile/CLAUDE.md → *Design system*.

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetMain: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { padding: 20, gap: 8, paddingBottom: 12 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectBtnDisabled: { opacity: 0.6 },
  selectBtnText: { fontSize: 14 },
  selectBtnChevron: { fontSize: 12, marginLeft: 8 },

  subjectRow: { flexDirection: 'row', gap: 8 },
  subjectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  subjectChipText: { fontSize: 13, fontWeight: '500' },

  unitRow: { flexDirection: 'row', gap: 8 },

  editLockedBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  editLockedText: { fontSize: 12, lineHeight: 18 },
  habitNote: {
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  habitNoteText: { fontSize: 12 },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  androidDateBtn: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  androidDateBtnText: { fontSize: 14 },
  clearBtn: { fontSize: 13, fontWeight: '500' },

  smartHint: {
    marginTop: 12,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
  },
  smartHintText: { fontSize: 12, lineHeight: 17 },

  errorRow: { marginTop: 12 },
  errorText: { fontSize: 13 },

  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 14, fontWeight: '700' },

  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sheetScroll: { maxHeight: 400 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  sheetRowText: { fontSize: 14, flex: 1 },
  sheetCheck: { fontSize: 14, marginLeft: 8 },
  // Inline-typeahead dropdown — anchored directly below the search input
  // (no Modal), so it sits inside the form's KeyboardAvoidingView and rides
  // up with the soft keyboard. Capped at 3 matches per the UX brief.
  comboDropdown: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  comboRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  comboRowText: { fontSize: 14 },
  comboEmpty: {
    fontSize: 13,
    paddingVertical: 16,
    paddingHorizontal: 12,
    textAlign: 'center',
  },
})
