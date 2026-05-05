import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type WorkoutType } from '../lib/api'
import { WORKOUT_TYPE_STYLES } from '../lib/workoutTypeStyles'

type Props = StackScreenProps<RootStackParamList, 'AddPersonalWorkout'>

// Categories matter for grouping the type picker; the order matches the web
// (`WORKOUT_CATEGORIES`) so users see Strength / Metcon / MonoStructural /
// Skill Work / Warmup-Recovery in the same sequence on both surfaces.
const CATEGORY_ORDER: ReadonlyArray<string> = [
  'Strength',
  'Metcon',
  'MonoStructural',
  'Skill Work',
  'Warmup/Recovery',
]

function formatDayLabel(dateKey: string): string {
  const [y, mo, d] = dateKey.split('-').map(Number)
  if (!y || !mo || !d) return dateKey
  const date = new Date(y, mo - 1, d)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AddPersonalWorkoutScreen({ navigation, route }: Props) {
  const { scheduledAt } = route.params

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkoutType>('METCON')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persistent "Done" affordance in the modal header so the keyboard can
  // always be dismissed — multiline TextInputs on RN consume the return
  // key as a newline, so without this users can get stuck after editing
  // the description with no obvious way to hide the keyboard.
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
          <Text style={styles.headerDoneText}>Done</Text>
        </TouchableOpacity>
      ),
    })
  }, [navigation])

  // Group types by category for the picker. Hide deprecated types unless
  // already selected (mirrors the web drawer's filter so legacy rows stay
  // editable but new authors don't reach for them).
  const typesByCategory = useMemo(() => {
    const groups: Record<string, WorkoutType[]> = {}
    for (const [t, style] of Object.entries(WORKOUT_TYPE_STYLES) as Array<[WorkoutType, typeof WORKOUT_TYPE_STYLES[WorkoutType]]>) {
      if (style.deprecated && t !== type) continue
      const cat = style.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    }
    return groups
  }, [type])

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !submitting

  async function handleSave() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // Construct an ISO timestamp at noon UTC on the chosen day so it lands
      // on the same calendar date regardless of viewer timezone (mirrors the
      // web drawer's `dateKey + 'T12:00:00'` convention).
      const iso = new Date(`${scheduledAt}T12:00:00Z`).toISOString()
      await api.me.personalProgram.workouts.create({
        title: title.trim(),
        description: description.trim(),
        type,
        scheduledAt: iso,
      })
      navigation.goBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save workout')
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Tap-outside-input dismisses the keyboard. Wrap only the
            non-input content so taps on TextInputs don't get intercepted —
            `accessible={false}` keeps the wrapper invisible to screen
            readers since it's purely a gesture surface. */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View>
            <Text style={styles.dayLabel}>{formatDayLabel(scheduledAt)}</Text>
            <Text style={styles.subtitle}>Personal Program — only you will see this workout.</Text>
          </View>
        </TouchableWithoutFeedback>

        <Text style={styles.sectionLabel}>TITLE</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Easy Z2 row"
          placeholderTextColor="#6b7280"
          maxLength={120}
          autoFocus
          returnKeyType="next"
          testID="title-input"
        />

        <Text style={styles.sectionLabel}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Sets, reps, notes…"
          placeholderTextColor="#6b7280"
          multiline
          numberOfLines={5}
          testID="description-input"
        />

        <Text style={styles.sectionLabel}>TYPE</Text>
        <View style={styles.categoryList}>
          {CATEGORY_ORDER.filter((c) => typesByCategory[c]?.length).map((category) => (
            <View key={category} style={styles.categoryGroup}>
              <Text style={styles.categoryHeader}>{category.toUpperCase()}</Text>
              <View style={styles.chipRow}>
                {typesByCategory[category].map((t) => {
                  const style = WORKOUT_TYPE_STYLES[t]
                  const selected = t === type
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setType(t)}
                      style={[
                        styles.chip,
                        selected && {
                          backgroundColor: style.bgTint,
                          borderColor: style.accentBar,
                        },
                      ]}
                      testID={`type-chip-${t}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={style.label}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          selected && { color: style.tint, fontWeight: '700' },
                        ]}
                      >
                        {style.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSave}
          disabled={!canSubmit}
          testID="save-button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Save workout</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={submitting}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scroll: { padding: 16, paddingBottom: 48 },

  dayLabel: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 24,
  },

  sectionLabel: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#111827',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 8,
    color: '#ffffff',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  categoryList: { marginTop: 4 },
  categoryGroup: { marginBottom: 12 },
  categoryHeader: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
  },
  chipLabel: { color: '#9ca3af', fontSize: 13 },

  error: {
    color: '#fca5a5',
    fontSize: 13,
    marginTop: 16,
  },

  submitBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#9ca3af',
    fontSize: 14,
  },

  headerDoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 4,
  },
  headerDoneText: {
    color: '#818cf8',
    fontSize: 15,
    fontWeight: '600',
  },
})
