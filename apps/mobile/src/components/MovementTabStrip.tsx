import { ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../lib/theme'
import ThemedText from './ThemedText'

interface MovementTabStripProps {
  movements: { workoutMovementId: string; movementName: string }[]
  active: number
  onChange: (idx: number) => void
}

export default function MovementTabStrip({ movements, active, onChange }: MovementTabStripProps) {
  const { colors } = useTheme()
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
          testID={`movement-tab-${i}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === active }}
          onPress={() => onChange(i)}
          style={[
            styles.chip,
            { backgroundColor: i === active ? colors.borderInteractive : colors.borderSubtle },
          ]}
        >
          <ThemedText
            variant={i === active ? undefined : 'tertiary'}
            style={[styles.chipText, i === active && styles.chipTextActive]}
          >
            {m.movementName}
          </ThemedText>
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
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  chipTextActive: { fontWeight: '600' },
})
