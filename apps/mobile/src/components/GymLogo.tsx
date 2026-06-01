import { Image, StyleSheet, View } from 'react-native'
import ThemedText from './ThemedText'
import { useTheme } from '../lib/theme'

const SIZES = {
  sm: { box: 28, text: 11 },
  md: { box: 44, text: 14 },
  lg: { box: 72, text: 20 },
} as const

function gymInitials(name: string): string {
  const tokens = name.trim().split(/[\s\-_/]+/).filter(Boolean)
  if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase()
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase()
  return '?'
}

interface Props {
  logoUrl?: string | null
  name: string
  size?: keyof typeof SIZES
}

export default function GymLogo({ logoUrl, name, size = 'md' }: Props) {
  const { colors } = useTheme()
  const { box, text } = SIZES[size]
  const radius = 10

  if (logoUrl) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={[styles.image, { width: box, height: box, borderRadius: radius, backgroundColor: colors.borderInteractive }]}
        accessibilityRole="image"
        accessibilityLabel={`${name} logo`}
      />
    )
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: box, height: box, borderRadius: radius, backgroundColor: colors.surfaceSubtle },
      ]}
    >
      <ThemedText style={{ fontSize: text, fontWeight: '700', color: colors.textSecondary }}>
        {gymInitials(name)}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
