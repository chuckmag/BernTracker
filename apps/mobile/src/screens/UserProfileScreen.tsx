import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { api, type PublicUserProfile } from '../lib/api'
import UserAvatar from '../components/UserAvatar'

type Props = StackScreenProps<RootStackParamList, 'UserProfile'>

function displayName(profile: PublicUserProfile): string {
  if (profile.firstName || profile.lastName) {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  }
  return profile.name ?? 'Athlete'
}

export default function UserProfileScreen({ route }: Props) {
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
      <View style={styles.centered}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (error || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'User not found.'}</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <UserAvatar
          avatarUrl={profile.avatarUrl}
          firstName={profile.firstName}
          lastName={profile.lastName}
          name={profile.name}
          size="lg"
        />
        <Text style={styles.name}>{displayName(profile)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
})
