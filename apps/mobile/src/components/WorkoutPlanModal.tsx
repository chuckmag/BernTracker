import { useState } from 'react'
import {
  Modal,
  View,
  Text,
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
  const [level, setLevel] = useState<WorkoutLevel | null>(existingPlan?.level ?? null)
  const [notes, setNotes] = useState(existingPlan?.notes ?? '')
  const [sections, setSections] = useState<MovementSection[]>(() => initSections(workout, existingPlan))
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
              ...(r.load ? { load: parseFloat(r.load) } : {}),
            }))
            .filter((s) => Object.keys(s).length > 0),
        }))
        .filter((mr) => mr.sets.length > 0)

      const plan = await api.plans.upsert(workout.id, targetUser.id, {
        level: level ?? null,
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.sheet}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Plan for {userName}</Text>
              <Text style={styles.headerSub}>{workout.title}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close plan editor"
            >
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* Level picker */}
            <Text style={styles.fieldLabel}>LEVEL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.levelRow} contentContainerStyle={styles.levelContent}>
              {LEVELS.map((l) => (
                <TouchableOpacity
                  key={l.value}
                  style={[styles.levelChip, level === l.value && styles.levelChipActive]}
                  onPress={() => setLevel(level === l.value ? null : l.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: level === l.value }}
                >
                  <Text style={[styles.levelChipText, level === l.value && styles.levelChipTextActive]}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Movement sections */}
            {showMovements && sections.map((section, si) => (
              <View key={section.workoutMovementId} style={styles.movementSection}>
                <Text style={styles.movementName}>{section.movementName}</Text>

                {/* Column headers */}
                <View style={styles.setHeaderRow}>
                  <Text style={[styles.setHeaderCell, styles.setNumCell]}>#</Text>
                  <Text style={[styles.setHeaderCell, styles.repsCell]}>Reps</Text>
                  <Text style={[styles.setHeaderCell, styles.loadCell]}>Load ({section.loadUnit})</Text>
                  <View style={styles.removeCell} />
                </View>

                {section.sets.map((row, ri) => (
                  <View key={ri} style={styles.setRow}>
                    <Text style={[styles.setNum, styles.setNumCell]}>{ri + 1}</Text>
                    <TextInput
                      style={[styles.setInput, styles.repsCell]}
                      value={row.reps}
                      onChangeText={(v) => updateSet(si, ri, 'reps', v)}
                      keyboardType="numeric"
                      placeholder="—"
                      placeholderTextColor="#4b5563"
                      accessibilityLabel={`Set ${ri + 1} reps`}
                    />
                    <TextInput
                      style={[styles.setInput, styles.loadCell]}
                      value={row.load}
                      onChangeText={(v) => updateSet(si, ri, 'load', v)}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor="#4b5563"
                      accessibilityLabel={`Set ${ri + 1} load`}
                    />
                    <TouchableOpacity
                      style={styles.removeCell}
                      onPress={() => removeSet(si, ri)}
                      disabled={section.sets.length <= 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove set ${ri + 1}`}
                    >
                      <Text style={[styles.removeBtn, section.sets.length <= 1 && styles.removeBtnDisabled]}>−</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <TouchableOpacity onPress={() => addSet(si)} style={styles.addSetBtn}>
                  <Text style={styles.addSetText}>+ Add set</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Notes */}
            <Text style={styles.fieldLabel}>NOTES FOR ATHLETE</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Focus on form over weight today…"
              placeholderTextColor="#4b5563"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Plan'}</Text>
              </TouchableOpacity>

              {existingPlan && onDeleted && (
                <TouchableOpacity
                  style={[styles.deleteBtn, saving && styles.btnDisabled]}
                  onPress={handleDelete}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <Text style={styles.deleteBtnText}>Remove Plan</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerText: { flex: 1, marginRight: 12 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeBtn: { fontSize: 18, color: '#6b7280', fontWeight: '600', paddingTop: 2 },
  body: { paddingHorizontal: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4b5563',
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
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  levelChipActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  levelChipText: { fontSize: 14, color: '#6b7280' },
  levelChipTextActive: { color: '#818cf8', fontWeight: '600' },
  movementSection: { marginTop: 20 },
  movementName: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 10 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  setHeaderCell: { fontSize: 11, fontWeight: '600', color: '#4b5563', letterSpacing: 0.5 },
  setNum: { fontSize: 13, color: '#4b5563' },
  setNumCell: { width: 28 },
  repsCell: { flex: 1, marginRight: 8 },
  loadCell: { flex: 1, marginRight: 8 },
  removeCell: { width: 28, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setInput: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 14,
    color: '#ffffff',
  },
  removeBtn: { fontSize: 20, color: '#6b7280', lineHeight: 24 },
  removeBtnDisabled: { opacity: 0.3 },
  addSetBtn: { paddingVertical: 4, marginTop: 4 },
  addSetText: { fontSize: 13, color: '#818cf8' },
  notesInput: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#ffffff',
    minHeight: 80,
  },
  footerActions: { paddingVertical: 20, gap: 10 },
  saveBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#991b1b',
  },
  deleteBtnText: { color: '#f87171', fontSize: 16, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
})
