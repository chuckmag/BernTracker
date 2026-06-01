import { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native'
import { useProgramFilter } from '../context/ProgramFilterContext'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'
import ThemedView from './ThemedView'

/**
 * Header-button entry point for the multi-program filter on FeedScreen.
 *
 * Behaviour mirrors apps/web/src/components/ProgramFilterPicker.tsx:
 *   - Compact label: "All programs" / "<Name>" / "<Name> + N more"
 *   - Tap → modal with checkbox-style toggle rows
 *   - "Clear" pill resets to empty (= all programs) — matches the web semantics
 *
 * Hidden entirely if the user has no available programs (avoids a useless
 * dropdown for first-run gyms).
 */
export default function ProgramFilterPicker() {
  const { colors } = useTheme()
  const { selected, available, loading, toggle, clear } = useProgramFilter()
  const [open, setOpen] = useState(false)

  if (!available.length && !loading) return null

  const labelText = (() => {
    if (selected.length === 0) return 'All programs'
    const names = selected
      .map((id) => available.find((gp) => gp.program.id === id)?.program.name)
      .filter((n): n is string => Boolean(n))
    if (names.length === 0) return 'All programs'
    if (names.length === 1) return names[0]
    return `${names[0]} + ${names.length - 1} more`
  })()

  return (
    <>
      <TouchableOpacity
        style={[styles.headerButton, { backgroundColor: colors.inputBg }]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Filter programs"
        testID="program-filter-button"
      >
        <ThemedText variant="secondary" style={styles.headerButtonText} numberOfLines={1}>{labelText}</ThemedText>
        <ThemedText style={[styles.chevron, { color: colors.primary }]}>▾</ThemedText>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: colors.modalScrim }]} onPress={() => setOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ThemedView variant="card" style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <ThemedText style={styles.sheetTitle}>Programs</ThemedText>
                <TouchableOpacity onPress={clear} testID="program-filter-clear">
                  <ThemedText style={[styles.clearText, { color: colors.primary }]}>Clear</ThemedText>
                </TouchableOpacity>
              </View>
              <ThemedText variant="tertiary" style={styles.helper}>
                Empty selection shows workouts from every program.
              </ThemedText>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {loading && available.length === 0 ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  available.map(({ program }) => {
                    const isSelected = selected.includes(program.id)
                    return (
                      <TouchableOpacity
                        key={program.id}
                        style={[styles.row, { borderBottomColor: colors.borderSubtle }]}
                        onPress={() => toggle(program.id)}
                        testID={`program-row-${program.id}`}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            { borderColor: colors.borderInteractive },
                            isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                          ]}
                        >
                          {isSelected && <ThemedText style={[styles.checkmark, { color: colors.onPrimary }]}>✓</ThemedText>}
                        </View>
                        <ThemedText variant="secondary" style={styles.rowLabel} numberOfLines={1}>{program.name}</ThemedText>
                      </TouchableOpacity>
                    )
                  })
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={() => setOpen(false)}
                testID="program-filter-done"
              >
                <ThemedText style={[styles.doneBtnText, { color: colors.onPrimary }]}>Done</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
    maxWidth: 180,
  },
  headerButtonText: {
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  chevron: { fontSize: 11 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  clearText: { fontSize: 14, fontWeight: '500' },
  helper: { fontSize: 12, marginBottom: 12 },
  list: { maxHeight: 360 },
  listContent: { paddingVertical: 4 },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkmark: { fontSize: 14, fontWeight: '700' },
  rowLabel: { fontSize: 15, flex: 1 },
  doneBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  doneBtnText: { fontSize: 15, fontWeight: '600' },
})
