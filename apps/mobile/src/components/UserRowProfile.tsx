import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import UserAvatar from './UserAvatar'

export interface UserRowProfileUser {
  id: string
  firstName: string | null
  lastName: string | null
  name: string | null
  avatarUrl: string | null
}

export function displayNameOf(user: UserRowProfileUser): string {
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ')
  }
  return user.name ?? '—'
}

interface Props {
  user: UserRowProfileUser
  onAvatarPress?: () => void
}

export default function UserRowProfile({ user, onAvatarPress }: Props) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onAvatarPress}
        disabled={!onAvatarPress}
        accessibilityLabel={`View ${displayNameOf(user)}'s profile`}
        accessibilityRole="button"
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <UserAvatar
          avatarUrl={user.avatarUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          name={user.name}
          size="sm"
        />
      </TouchableOpacity>
      <Text style={styles.name} numberOfLines={1}>
        {displayNameOf(user)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#f9fafb',
  },
})
