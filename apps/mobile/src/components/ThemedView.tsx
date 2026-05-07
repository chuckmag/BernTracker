import { View, type ViewProps } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/theme'

type ViewVariant = 'screen' | 'card' | 'input' | 'transparent'

interface ThemedViewProps extends ViewProps {
  variant?: ViewVariant
}

function bgForVariant(variant: ViewVariant, colors: ThemeColors): string | undefined {
  switch (variant) {
    case 'screen':      return colors.screenBg
    case 'card':        return colors.cardBg
    case 'input':       return colors.inputBg
    case 'transparent': return undefined
  }
}

// Drop-in replacement for RN's <View> that applies the correct background
// color for the active theme. Use `variant` to express semantic intent.
//
// Usage:
//   <ThemedView variant="screen" style={styles.container}>…</ThemedView>
//   <ThemedView variant="card" style={styles.card}>…</ThemedView>
//   <ThemedView>…</ThemedView>  ← transparent (no background), same as bare View
export default function ThemedView({ variant = 'transparent', style, ...props }: ThemedViewProps) {
  const { colors } = useTheme()
  const bg = bgForVariant(variant, colors)
  return (
    <View
      style={[bg !== undefined ? { backgroundColor: bg } : undefined, style]}
      {...props}
    />
  )
}
