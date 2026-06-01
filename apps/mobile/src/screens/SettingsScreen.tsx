import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import { api, type IdentifiedGender, type UserProfile } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme, type ThemeMode } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'
import AvatarUploader from '../components/AvatarUploader'
import BirthdayField from '../components/BirthdayField'
import type { RootStackParamList } from '../../App'

// Mirrors the web Profile.tsx Details tab — same fields, same order, same
// labels. Theme picker mirrors the cross-app `wodalytics-theme` AsyncStorage
// contract from apps/web/CLAUDE.md → *Cross-app contracts*.

const GENDER_OPTIONS: { value: NonNullable<IdentifiedGender>; label: string }[] = [
  { value: 'FEMALE',            label: 'Female' },
  { value: 'MALE',              label: 'Male' },
  { value: 'NON_BINARY',        label: 'Non-binary' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
]

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
  { value: 'system', label: 'System' },
]

type Nav = StackNavigationProp<RootStackParamList, 'Settings'>

export default function SettingsScreen() {
  const { logout } = useAuth()
  const { colors, mode: themeMode, setMode: setThemeMode } = useTheme()
  const navigation = useNavigation<Nav>()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender> | ''>('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    api.users.me.profile.get()
      .then((p) => {
        if (cancelled) return
        setProfile(p)
        setFirstName(p.firstName ?? '')
        setLastName(p.lastName ?? '')
        setBirthday(p.birthday ? p.birthday.slice(0, 10) : '')
        setGender(p.identifiedGender ?? '')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const updated = await api.users.me.profile.update({
        firstName: firstName.trim() || undefined,
        lastName:  lastName.trim()  || undefined,
        birthday:  birthday || null,
        identifiedGender: gender || null,
      })
      setProfile(updated)
      setSavedAt(Date.now())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out?',
      'You will need to sign in again to access your gym.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            logout().catch((e: unknown) => {
              Alert.alert('Sign-out failed', e instanceof Error ? e.message : 'Please try again.')
            })
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (!profile) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ThemedText style={{ color: colors.errorText }}>{error ?? 'Profile unavailable.'}</ThemedText>
      </ThemedView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView variant="screen" style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Avatar uploader + identity row */}
          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            <AvatarUploader size="lg" />
            <View style={styles.identityText}>
              <ThemedText style={styles.identityName}>
                {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.name || 'Athlete'}
              </ThemedText>
              <ThemedText variant="tertiary" style={styles.identityEmail}>{profile.email}</ThemedText>
            </View>
          </ThemedView>

          {/* Personal info */}
          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            <ThemedText variant="label" style={styles.sectionLabel}>PERSONAL INFO</ThemedText>

            <View style={styles.field}>
              <ThemedText variant="label" style={styles.fieldLabel}>First name</ThemedText>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor={colors.textPlaceholder}
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
                ]}
                autoCapitalize="words"
                testID="first-name-input"
              />
            </View>

            <View style={styles.field}>
              <ThemedText variant="label" style={styles.fieldLabel}>Last name</ThemedText>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor={colors.textPlaceholder}
                style={[
                  styles.input,
                  { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
                ]}
                autoCapitalize="words"
                testID="last-name-input"
              />
            </View>

            <BirthdayField
              value={birthday}
              onChange={setBirthday}
              helper="Used to determine your age category for results."
              testID="birthday-input"
            />

            <View style={styles.field}>
              <ThemedText variant="label" style={styles.fieldLabel}>Identified gender</ThemedText>
              <View style={styles.chipRow}>
                {GENDER_OPTIONS.map((g) => {
                  const active = gender === g.value
                  return (
                    <TouchableOpacity
                      key={g.value}
                      onPress={() => setGender(g.value)}
                      style={[
                        styles.chip,
                        { borderColor: colors.borderInteractive, backgroundColor: active ? colors.primary : 'transparent' },
                      ]}
                      testID={`gender-chip-${g.value}`}
                    >
                      <ThemedText style={[styles.chipText, { color: active ? colors.onPrimary : colors.textSecondary }]}>
                        {g.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <ThemedText variant="tertiary" style={styles.fieldHint}>
                Self-identified — used for default leaderboard grouping. You can override per result.
              </ThemedText>
            </View>
          </ThemedView>

          {/* Memberships — quick path to find / request to join another gym (#505) */}
          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            <ThemedText variant="label" style={styles.sectionLabel}>GYM MEMBERSHIPS</ThemedText>
            <TouchableOpacity
              style={[styles.linkRow, { borderColor: colors.borderInteractive }]}
              onPress={() => navigation.navigate('BrowseGyms')}
              accessibilityRole="button"
              testID="browse-gyms-link"
            >
              <ThemedText style={[styles.linkRowText, { color: colors.textPrimary }]}>Find another gym</ThemedText>
              <ThemedText style={[styles.linkRowChevron, { color: colors.textTertiary }]}>›</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          {/* Appearance */}
          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            <ThemedText variant="label" style={styles.sectionLabel}>APPEARANCE</ThemedText>
            <View style={styles.field}>
              <ThemedText variant="label" style={styles.fieldLabel}>Theme</ThemedText>
              <View style={styles.chipRow}>
                {THEME_OPTIONS.map((t) => {
                  const active = themeMode === t.value
                  return (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setThemeMode(t.value)}
                      style={[
                        styles.chip,
                        { borderColor: colors.borderInteractive, backgroundColor: active ? colors.primary : 'transparent' },
                      ]}
                      testID={`theme-chip-${t.value}`}
                    >
                      <ThemedText style={[styles.chipText, { color: active ? colors.onPrimary : colors.textSecondary }]}>
                        {t.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <ThemedText variant="tertiary" style={styles.fieldHint}>System follows your device's appearance setting.</ThemedText>
            </View>
          </ThemedView>

          {error && (
            <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>
          )}

          {savedAt && !error && (
            <ThemedText style={[styles.saved, { color: colors.successText }]}>Saved.</ThemedText>
          )}

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary }, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
            testID="save-button"
          >
            {saving
              ? <ActivityIndicator color={colors.onPrimary} />
              : <ThemedText style={[styles.saveButtonText, { color: colors.onPrimary }]}>Save changes</ThemedText>}
          </TouchableOpacity>

          {/* Sign out — danger zone, lives at the bottom out of muscle-memory reach */}
          <TouchableOpacity
            style={[styles.signOutButton, { borderColor: colors.errorText }]}
            onPress={handleSignOut}
            testID="sign-out-button"
          >
            <ThemedText style={[styles.signOutText, { color: colors.errorText }]}>Sign out</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontSize: 18,
    fontWeight: '700',
  },
  identityEmail: {
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fieldHint: {
    fontSize: 12,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
  saved: {
    fontSize: 14,
    textAlign: 'center',
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkRowText: {
    fontSize: 15,
    fontWeight: '500',
  },
  linkRowChevron: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 22,
  },
})
