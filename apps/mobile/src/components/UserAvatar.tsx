import { Image, View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../lib/theme'

const SIZES = {
  sm: { box: 32, text: 11 },
  lg: { box: 96, text: 32 },
} as const

function initialsOf(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  name: string | null | undefined,
): string {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName[0].toUpperCase()
  if (name) {
    const parts = name.trim().split(/\s+/)
    return `${parts[0][0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?'
  }
  return '?'
}

interface Props {
  avatarUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  size?: 'sm' | 'lg'
}

export default function UserAvatar({ avatarUrl, firstName, lastName, name, size = 'sm' }: Props) {
  const { colors } = useTheme()
  const { box, text } = SIZES[size]
  const radius = box / 2

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.image, { width: box, height: box, borderRadius: radius, backgroundColor: colors.borderInteractive }]}
        accessibilityRole="image"
      />
    )
  }

  return (
    <View style={[styles.placeholder, { width: box, height: box, borderRadius: radius, backgroundColor: colors.primary }]}>
      <Text style={[styles.initials, { fontSize: text, color: colors.onPrimary }]}>
        {initialsOf(firstName, lastName, name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {},
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '600',
  },
})
