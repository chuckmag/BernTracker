import { Text, type TextProps, StyleSheet } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/theme'

type TextVariant = 'primary' | 'secondary' | 'tertiary' | 'muted' | 'label'

interface ThemedTextProps extends TextProps {
  variant?: TextVariant
}

function colorForVariant(variant: TextVariant, colors: ThemeColors): string {
  switch (variant) {
    case 'primary':   return colors.textPrimary
    case 'secondary': return colors.textSecondary
    case 'tertiary':  return colors.textTertiary
    case 'muted':     return colors.textMuted
    case 'label':     return colors.textLabel
  }
}

// Drop-in replacement for RN's <Text> that automatically applies the correct
// text color for the active light/dark theme. Use `variant` to express
// semantic intent rather than hardcoding hex values.
//
// Usage:
//   <ThemedText>Primary body copy</ThemedText>
//   <ThemedText variant="secondary">De-emphasised text</ThemedText>
//   <ThemedText style={{ fontSize: 24, fontWeight: 'bold' }}>Heading</ThemedText>
export default function ThemedText({ variant = 'primary', style, ...props }: ThemedTextProps) {
  const { colors } = useTheme()
  return (
    <Text
      style={[{ color: colorForVariant(variant, colors) }, style]}
      {...props}
    />
  )
}
