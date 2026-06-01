import { useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

type BirthdayFieldProps = {
  /** YYYY-MM-DD string. Empty string means no birthday set. */
  value: string
  onChange: (next: string) => void
  /** Optional helper copy under the field. */
  helper?: string
  /** Override the default "Birthday" label. */
  label?: string
  testID?: string
}

const MIN_DATE = new Date(1900, 0, 1)

// Format a Date as YYYY-MM-DD in the local timezone — the API stores
// birthday as a date-only column, so the local calendar day is what
// the user means (rather than a UTC slice that could shift by one).
function toYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fromYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return isNaN(date.getTime()) ? null : date
}

const LONG_DATE_FMT = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function formatDisplay(value: string): string | null {
  const date = fromYmd(value)
  return date ? LONG_DATE_FMT.format(date) : null
}

// Native date picker for the user's birthday. iOS opens a modal with the
// system spinner-wheel; Android pops the platform's date dialog. Emits the
// chosen date back as a YYYY-MM-DD string, matching the API contract.
export default function BirthdayField({
  value,
  onChange,
  helper,
  label = 'Birthday',
  testID = 'birthday-field',
}: BirthdayFieldProps) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)
  // iOS spinner emits a pick on every wheel scroll. Hold those in a local
  // draft and only commit to the parent on Done — Cancel should leave the
  // committed value untouched.
  const [iosDraft, setIosDraft] = useState<string | null>(null)

  const display = formatDisplay(value)
  const initialDate = fromYmd(value) ?? new Date(2000, 0, 1)
  const maxDate = new Date()

  function handleAndroidChange(event: DateTimePickerEvent, picked?: Date) {
    setOpen(false)
    if (event.type === 'set' && picked) onChange(toYmd(picked))
  }

  function handleIOSChange(_event: DateTimePickerEvent, picked?: Date) {
    if (picked) setIosDraft(toYmd(picked))
  }

  function handleIOSDone() {
    // First-open with no committed value: the spinner is *showing* initialDate
    // (2000-01-01) but the user never touched the wheel, so iosDraft is null.
    // Commit the displayed default so Done means what it looks like and the
    // onboarding validator doesn't reject an apparently-filled field.
    if (iosDraft !== null) onChange(iosDraft)
    else if (!value) onChange(toYmd(initialDate))
    setIosDraft(null)
    setOpen(false)
  }

  function handleIOSCancel() {
    setIosDraft(null)
    setOpen(false)
  }

  return (
    <View style={styles.field}>
      <ThemedText variant="label" style={styles.fieldLabel}>{label}</ThemedText>

      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[
          styles.input,
          { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, tap to pick a date`}
        accessibilityValue={{ text: display ?? 'not set' }}
        testID={testID}
      >
        <ThemedText style={{ color: display ? colors.textPrimary : colors.textPlaceholder }}>
          {display ?? 'Tap to pick a date'}
        </ThemedText>
      </TouchableOpacity>

      {helper && <ThemedText variant="tertiary" style={styles.fieldHint}>{helper}</ThemedText>}

      {/* Android picker — fires as a one-shot dialog. */}
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={initialDate}
          mode="date"
          display="default"
          maximumDate={maxDate}
          minimumDate={MIN_DATE}
          onChange={handleAndroidChange}
          testID={`${testID}-picker`}
        />
      )}

      {/* iOS picker — wrap in a modal so the wheel sits over the screen and
          the user explicitly confirms with Done. Backdrop tap = Cancel. */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={handleIOSCancel}
        >
          <Pressable style={[styles.iosBackdrop, { backgroundColor: colors.modalScrim }]} onPress={handleIOSCancel}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ThemedView variant="card" style={[styles.iosSheet, { borderColor: colors.borderSubtle }]}>
                <View style={[styles.iosSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
                  <TouchableOpacity
                    onPress={handleIOSCancel}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel, discard birthday selection"
                    testID={`${testID}-cancel`}
                  >
                    <ThemedText variant="secondary">Cancel</ThemedText>
                  </TouchableOpacity>
                  <ThemedText style={styles.iosSheetTitle}>{label}</ThemedText>
                  <TouchableOpacity
                    onPress={handleIOSDone}
                    accessibilityRole="button"
                    accessibilityLabel="Done, confirm birthday selection"
                    testID={`${testID}-done`}
                  >
                    <ThemedText style={{ color: colors.primary, fontWeight: '600' }}>Done</ThemedText>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={(iosDraft ? fromYmd(iosDraft) : fromYmd(value)) ?? initialDate}
                  mode="date"
                  display="spinner"
                  maximumDate={maxDate}
                  minimumDate={MIN_DATE}
                  onChange={handleIOSChange}
                  testID={`${testID}-picker`}
                />
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  iosBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingBottom: 24,
  },
  iosSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iosSheetTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
})
