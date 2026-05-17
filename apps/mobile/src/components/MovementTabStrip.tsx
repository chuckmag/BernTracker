import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native'

interface MovementTabStripProps {
  movements: { workoutMovementId: string; movementName: string }[]
  active: number
  onChange: (idx: number) => void
}

export default function MovementTabStrip({ movements, active, onChange }: MovementTabStripProps) {
  if (movements.length <= 1) return null
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {movements.map((m, i) => (
        <TouchableOpacity
          key={m.workoutMovementId}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === active }}
          onPress={() => onChange(i)}
          style={[styles.chip, i === active && styles.chipActive]}
        >
          <Text style={[styles.chipText, i === active && styles.chipTextActive]}>
            {m.movementName}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  strip: { marginBottom: 12 },
  content: { gap: 6, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1f2937',
  },
  chipActive: { backgroundColor: '#374151' },
  chipText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#ffffff', fontWeight: '600' },
})
