import { useEffect, useState } from 'react'
import { StyleSheet, ActivityIndicator } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type PublicUserProfile } from '../lib/api'
import UserAvatar from '../components/UserAvatar'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>

function displayName(profile: PublicUserProfile): string {
  if (profile.firstName || profile.lastName) {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  }
  return profile.name ?? 'Athlete'
}

export default function UserProfileScreen({ route }: Props) {
  const { colors } = useTheme()
  const { userId } = route.params
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.users.public(userId)
      .then(setProfile)
      .catch((e: Error) => setError(e.message ?? 'User not found'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <ThemedView variant="screen" style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (error || !profile) {
    return (
      <ThemedView variant="screen" style={styles.centered}>
        <ThemedText style={[styles.errorText, { color: colors.errorText }]}>{error ?? 'User not found.'}</ThemedText>
      </ThemedView>
    )
  }

  return (
    <ThemedView variant="screen" style={styles.root}>
      <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
        <UserAvatar
          avatarUrl={profile.avatarUrl}
          firstName={profile.firstName}
          lastName={profile.lastName}
          name={profile.name}
          size="lg"
        />
        <ThemedText style={styles.name}>{displayName(profile)}</ThemedText>
      </ThemedView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
})
