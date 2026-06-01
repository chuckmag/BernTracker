import { StyleSheet, TouchableOpacity } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'

// Top-right header button that shows the logged-in user's avatar (initials
// fallback) and opens SettingsScreen as a modal on tap. Mounted via
// `headerRight` on each main-tab stack so it appears on Home / Feed / History
// / Analytics without consuming a 5th tab slot.
export default function AvatarHeaderButton() {
  const { user } = useAuth()
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>()

  if (!user) return null

  return (
    <TouchableOpacity
      style={styles.touch}
      onPress={() => navigation.navigate('Settings')}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      testID="avatar-header-button"
    >
      <UserAvatar
        avatarUrl={user.avatarUrl}
        firstName={user.firstName}
        lastName={user.lastName}
        name={user.name}
        size="sm"
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  touch: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
})
