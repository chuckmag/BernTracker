import { useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native'
import { useProgramFilter } from '../context/ProgramFilterContext'

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
  const { selected, available, loading, toggle, clear } = useProgramFilter()
  const [open, setOpen] = useState(false)

  if (!available.length && !loading) return null

  const labelText = (() => {
    if (selected.length === 0) return 'All programs'
    const names = selected
      .map((id) => available.find((p) => p.id === id)?.name)
      .filter((n): n is string => Boolean(n))
    if (names.length === 0) return 'All programs'
    if (names.length === 1) return names[0]
    return `${names[0]} + ${names.length - 1} more`
  })()

  return (
    <>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => setOpen(true)}
        accessibilityLabel="Filter programs"
        testID="program-filter-button"
      >
        <Text style={styles.headerButtonText} numberOfLines={1}>{labelText}</Text>
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Programs</Text>
              <TouchableOpacity onPress={clear} testID="program-filter-clear">
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helper}>
              Empty selection shows workouts from every program.
            </Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {loading && available.length === 0 ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#818cf8" />
                </View>
              ) : (
                available.map((p) => {
                  const isSelected = selected.includes(p.id)
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.row}
                      onPress={() => toggle(p.id)}
                      testID={`program-row-${p.id}`}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <Text style={styles.rowLabel} numberOfLines={1}>{p.name}</Text>
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setOpen(false)}
              testID="program-filter-done"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
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
    backgroundColor: '#1f2937',
    borderRadius: 6,
    marginRight: 12,
    maxWidth: 180,
  },
  headerButtonText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
    marginRight: 4,
  },
  chevron: { color: '#818cf8', fontSize: 11 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
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
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  clearText: { color: '#818cf8', fontSize: 14, fontWeight: '500' },
  helper: { color: '#6b7280', fontSize: 12, marginBottom: 12 },
  list: { maxHeight: 360 },
  listContent: { paddingVertical: 4 },
  loadingRow: { paddingVertical: 24, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  rowLabel: { color: '#e5e7eb', fontSize: 15, flex: 1 },
  doneBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  doneBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
})
