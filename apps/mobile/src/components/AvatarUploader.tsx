import { useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../lib/theme'
import UserAvatar from './UserAvatar'
import ThemedText from './ThemedText'

type AvatarUploaderProps = {
  size?: 'sm' | 'lg'
  helper?: string
}

type Source = 'camera' | 'library' | 'remove' | 'cancel'

// Tap the avatar to take a new photo, pick one from the library, or remove
// the existing one. expo-image-picker handles permissions + the system crop
// UI (`allowsEditing: true, aspect: [1,1]`) so we only need to upload the
// returned URI. Server still does its 512×512 WebP normalize.
export default function AvatarUploader({ size = 'lg', helper }: AvatarUploaderProps) {
  const { user, refreshUser } = useAuth()
  const { colors } = useTheme()
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  function showOptions() {
    const options: { label: string; source: Source }[] = [
      { label: 'Take Photo',         source: 'camera' },
      { label: 'Choose from Library', source: 'library' },
    ]
    if (user?.avatarUrl) options.push({ label: 'Remove Photo', source: 'remove' })
    options.push({ label: 'Cancel', source: 'cancel' })

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: options.map((o) => o.label),
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: user?.avatarUrl ? options.length - 2 : undefined,
        },
        (idx) => handleSource(options[idx].source),
      )
    } else {
      Alert.alert(
        'Profile photo',
        undefined,
        options.map((o) => ({
          text: o.label,
          style: o.source === 'cancel' ? 'cancel' : o.source === 'remove' ? 'destructive' : 'default',
          onPress: () => handleSource(o.source),
        })),
      )
    }
  }

  async function handleSource(source: Source) {
    setError(null)
    if (source === 'cancel') return
    if (source === 'remove') return handleRemove()
    if (source === 'camera') return pickAndUpload('camera')
    if (source === 'library') return pickAndUpload('library')
  }

  async function pickAndUpload(source: 'camera' | 'library') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setError(
        source === 'camera'
          ? 'Camera permission is needed to take a photo.'
          : 'Photo library permission is needed to choose a photo.',
      )
      return
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setBusy('upload')
    try {
      await api.users.me.avatar.upload({
        uri: asset.uri,
        name: asset.fileName ?? `avatar.${asset.uri.split('.').pop() ?? 'jpg'}`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      })
      await refreshUser()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  async function handleRemove() {
    setBusy('remove')
    try {
      await api.users.me.avatar.remove()
      await refreshUser()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove photo')
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={styles.root}>
      <TouchableOpacity
        onPress={showOptions}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel={user.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
        testID="avatar-uploader"
        style={busy !== null && styles.busy}
      >
        <View style={styles.avatarWrap}>
          <UserAvatar
            avatarUrl={user.avatarUrl}
            firstName={user.firstName}
            lastName={user.lastName}
            name={user.name}
            size={size}
          />
          {busy && (
            <View style={[styles.overlay, { backgroundColor: colors.cardBg + 'cc' }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.cardBg }]}>
            <ThemedText style={[styles.cameraIcon, { color: colors.onPrimary }]}>+</ThemedText>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.helperBlock}>
        <ThemedText variant="secondary" style={styles.helperPrimary}>
          {helper ?? (user.avatarUrl ? 'Tap to change photo' : 'Tap to add a photo')}
        </ThemedText>
        <ThemedText variant="tertiary" style={styles.helperHint}>
          {Platform.OS === 'ios' ? 'JPEG, PNG, HEIC — up to 20MB' : 'JPEG, PNG, WebP — up to 20MB'}
        </ThemedText>
        {error && (
          <ThemedText style={[styles.error, { color: colors.errorText }]} testID="avatar-uploader-error">
            {error}
          </ThemedText>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    position: 'relative',
  },
  busy: {
    opacity: 0.7,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  helperBlock: {
    flex: 1,
    gap: 2,
  },
  helperPrimary: {
    fontSize: 14,
    fontWeight: '500',
  },
  helperHint: {
    fontSize: 12,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
})
