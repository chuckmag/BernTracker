import { useState } from 'react'
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import type { Workout, WorkoutLevel, UserWorkoutPlan, LoadUnit, DistanceUnit } from '../lib/api'
import { api } from '../lib/api'
import MovementTabStrip from './MovementTabStrip'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

interface Props {
  visible: boolean
  workout: Workout
  targetUser: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string }
  existingPlan?: UserWorkoutPlan
  onClose: () => void
  onSaved: (plan: UserWorkoutPlan) => void
  onDeleted?: () => void
}

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX',       label: 'RX' },
  { value: 'SCALED',   label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

interface SetRow {
  reps: string
  load: string
}

interface MovementSection {
  workoutMovementId: string
  movementName: string
  loadUnit: LoadUnit
  distanceUnit: DistanceUnit
  sets: SetRow[]
}

function blankSet(): SetRow {
  return { reps: '', load: '' }
}

function initSections(workout: Workout, existingPlan?: UserWorkoutPlan): MovementSection[] {
  return workout.workoutMovements.map((wm) => {
    const existing = existingPlan?.value?.movementResults?.find(
      (mr) => mr.workoutMovementId === wm.movement.id,
    )
    const existingSets = existing?.sets
    const sets: SetRow[] = existingSets?.length
      ? existingSets.map((s) => ({ reps: s.reps ?? '', load: s.load !== undefined ? String(s.load) : '' }))
      : Array.from({ length: wm.sets ?? 1 }, () => ({ reps: wm.reps ?? '', load: '' }))
    return {
      workoutMovementId: wm.movement.id,
      movementName:      wm.movement.name,
      loadUnit:          ((existing?.loadUnit ?? wm.loadUnit ?? 'LB') as LoadUnit),
      distanceUnit:      ((existing?.distanceUnit ?? wm.distanceUnit ?? 'M') as DistanceUnit),
      sets,
    }
  })
}

export default function WorkoutPlanModal({ visible, workout, targetUser, existingPlan, onClose, onSaved, onDeleted }: Props) {
  const { colors } = useTheme()
  const [level, setLevel] = useState<WorkoutLevel>(existingPlan?.level ?? 'RX')
  const [notes, setNotes] = useState(existingPlan?.notes ?? '')
  const [sections, setSections] = useState<MovementSection[]>(() => initSections(workout, existingPlan))
  const [activeSection, setActiveSection] = useState(0)
  const [saving, setSaving] = useState(false)

  const userName = targetUser.firstName
    ? [targetUser.firstName, targetUser.lastName].filter(Boolean).join(' ')
    : (targetUser.name ?? targetUser.email)

  function updateSet(si: number, ri: number, field: keyof SetRow, val: string) {
    setSections((prev) =>
      prev.map((s, i) => i !== si ? s : {
        ...s,
        sets: s.sets.map((r, j) => j !== ri ? r : { ...r, [field]: val }),
      })
    )
  }

  function addSet(si: number) {
    setSections((prev) =>
      prev.map((s, i) => i !== si ? s : { ...s, sets: [...s.sets, blankSet()] })
    )
  }

  function removeSet(si: number, ri: number) {
    setSections((prev) =>
      prev.map((s, i) => i !== si ? s : { ...s, sets: s.sets.filter((_, j) => j !== ri) })
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const movementResults = sections
        .map((s) => ({
          workoutMovementId: s.workoutMovementId,
          loadUnit:          s.loadUnit,
          distanceUnit:      s.distanceUnit,
          sets: s.sets
            .map((r) => ({
              ...(r.reps ? { reps: r.reps } : {}),
              ...(r.load ? { load: r.load } : {}),
            }))
            .filter((s) => Object.keys(s).length > 0),
        }))
        .filter((mr) => mr.sets.length > 0)

      const plan = await api.plans.upsert(workout.id, targetUser.id, {
        level,
        value: movementResults.length > 0 ? { movementResults } : null,
        notes: notes.trim() || null,
      })
      onSaved(plan)
    } catch (e) {
      Alert.alert('Error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!existingPlan) return
    Alert.alert('Remove Plan', `Remove plan for ${userName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try {
            await api.plans.delete(workout.id, targetUser.id)
            onDeleted?.()
          } catch (e) {
            Alert.alert('Error', (e as Error).message)
          } finally {
            setSaving(false)
          }
        },
      },
    ])
  }

  const showMovements = workout.workoutMovements.length > 0

  const inputStyle = {
    backgroundColor: colors.inputBg,
    borderColor: colors.borderInteractive,
    color: colors.textPrimary,
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.modalScrim }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardWrap}
        >
          <ThemedView variant="card" style={styles.sheet}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
              <View style={styles.headerText}>
                <ThemedText style={styles.headerTitle}>Plan for {userName}</ThemedText>
                <ThemedText variant="tertiary" style={styles.headerSub}>{workout.title}</ThemedText>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close plan editor"
              >
                <ThemedText variant="tertiary" style={styles.closeBtn}>✕</ThemedText>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {/* Level picker */}
              <ThemedText variant="muted" style={styles.fieldLabel}>LEVEL</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.levelRow} contentContainerStyle={styles.levelContent}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l.value}
                    style={[
                      styles.levelChip,
                      { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive },
                      level === l.value && { backgroundColor: `${colors.primary}33`, borderColor: colors.primary },
                    ]}
                    onPress={() => setLevel(l.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: level === l.value }}
                  >
                    <ThemedText
                      variant="tertiary"
                      style={[
                        styles.levelChipText,
                        level === l.value && { color: colors.primary, fontWeight: '600' },
                      ]}
                    >
                      {l.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Movement sections — tabbed when multiple movements */}
              {showMovements && (() => {
                const section = sections[activeSection]
                if (!section) return null
                return (
                  <View style={styles.movementSection}>
                    <MovementTabStrip
                      movements={sections}
                      active={activeSection}
                      onChange={setActiveSection}
                    />

                    {/* Column headers */}
                    <View style={styles.setHeaderRow}>
                      <ThemedText variant="muted" style={[styles.setHeaderCell, styles.setNumCell]}>#</ThemedText>
                      <ThemedText variant="muted" style={[styles.setHeaderCell, styles.repsCell]}>Reps</ThemedText>
                      <ThemedText variant="muted" style={[styles.setHeaderCell, styles.loadCell]}>Load ({section.loadUnit})</ThemedText>
                      <View style={styles.removeCell} />
                    </View>

                    {section.sets.map((row, ri) => (
                      <View key={ri} style={styles.setRow}>
                        <ThemedText variant="muted" style={[styles.setNum, styles.setNumCell]}>{ri + 1}</ThemedText>
                        <TextInput
                          style={[styles.setInput, styles.repsCell, inputStyle]}
                          value={row.reps}
                          onChangeText={(v) => updateSet(activeSection, ri, 'reps', v)}
                          keyboardType="numeric"
                          placeholder="—"
                          placeholderTextColor={colors.textPlaceholder}
                          accessibilityLabel={`Set ${ri + 1} reps`}
                        />
                        <TextInput
                          style={[styles.setInput, styles.loadCell, inputStyle]}
                          value={row.load}
                          onChangeText={(v) => updateSet(activeSection, ri, 'load', v)}
                          keyboardType="default"
                          placeholder="e.g. 135 or 135-155"
                          placeholderTextColor={colors.textPlaceholder}
                          accessibilityLabel={`Set ${ri + 1} load`}
                        />
                        <TouchableOpacity
                          style={styles.removeCell}
                          onPress={() => removeSet(activeSection, ri)}
                          disabled={section.sets.length <= 1}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove set ${ri + 1}`}
                        >
                          <ThemedText
                            variant="tertiary"
                            style={[styles.removeBtn, section.sets.length <= 1 && styles.removeBtnDisabled]}
                          >−</ThemedText>
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity onPress={() => addSet(activeSection)} style={styles.addSetBtn}>
                      <ThemedText style={[styles.addSetText, { color: colors.primary }]}>+ Add set</ThemedText>
                    </TouchableOpacity>
                  </View>
                )
              })()}

              {/* Notes */}
              <ThemedText variant="muted" style={styles.fieldLabel}>NOTES FOR ATHLETE</ThemedText>
              <TextInput
                style={[styles.notesInput, inputStyle]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Focus on form over weight today…"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <ThemedText style={[styles.saveBtnText, { color: colors.onPrimary }]}>{saving ? 'Saving…' : 'Save Plan'}</ThemedText>
                </TouchableOpacity>

                {existingPlan && onDeleted && (
                  <TouchableOpacity
                    style={[styles.deleteBtn, { borderColor: colors.errorText }, saving && styles.btnDisabled]}
                    onPress={handleDelete}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <ThemedText style={[styles.deleteBtnText, { color: colors.errorText }]}>Remove Plan</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </ThemedView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    maxHeight: '90%',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerText: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { fontSize: 18, fontWeight: '600', paddingTop: 2 },
  body: { paddingHorizontal: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 10,
  },
  levelRow: { marginBottom: 4 },
  levelContent: { gap: 8, paddingBottom: 4 },
  levelChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  levelChipText: { fontSize: 14 },
  movementSection: { marginTop: 20 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  setHeaderCell: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  setNum: { fontSize: 13 },
  setNumCell: { width: 28 },
  repsCell: { flex: 1, marginRight: 8 },
  loadCell: { flex: 1, marginRight: 8 },
  removeCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 14,
  },
  removeBtn: { fontSize: 20, lineHeight: 24 },
  removeBtnDisabled: { opacity: 0.3 },
  addSetBtn: { paddingVertical: 4, marginTop: 4 },
  addSetText: { fontSize: 13 },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
  },
  footerActions: { paddingVertical: 20, gap: 10 },
  saveBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  deleteBtnText: { fontSize: 16, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
})
