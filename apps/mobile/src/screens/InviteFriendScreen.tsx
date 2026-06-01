import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { StackNavigationProp } from '@react-navigation/stack'
import { api, type Invitation, type InvitationChannel } from '../lib/api'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'
import type { RootStackParamList } from '../../App'

// Mirrors the web app-only-invite UX (see apps/web GymInvitationsPanel
// `InviteShareCard`): create an Invitation, then surface the code + a native
// Share sheet so the inviter can forward the link via any app on their device.

type Nav = StackNavigationProp<RootStackParamList, 'InviteFriend'>

// Same join-link shape the web router serves under /join/:code. Reuses the
// API base URL so dev/QA/prod builds each share a link pointing at the host
// they're actually talking to.
const WEB_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://qa.wodalytics.com'

const CHANNEL_OPTIONS: { value: InvitationChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
]

// E.164: + then 1–15 digits, leading digit 1–9. Matches the API's PhoneSchema.
const E164_PATTERN = /^\+[1-9]\d{1,14}$/
// Practical email format check that mirrors the API's z.string().email() bar.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function buildShareMessage(code: string, joinUrl: string): string {
  return `Join me on WODalytics! Use code ${code} or tap: ${joinUrl}`
}

export default function InviteFriendScreen() {
  const { colors } = useTheme()
  const navigation = useNavigation<Nav>()

  const [channel, setChannel] = useState<InvitationChannel>('EMAIL')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<Invitation | null>(null)

  function handleChangeChannel(next: InvitationChannel) {
    setChannel(next)
    setError(null)
  }

  async function handleSend() {
    setError(null)
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPhone = phone.trim()

    if (channel === 'EMAIL') {
      if (!trimmedEmail) {
        setError('Enter an email address to send the invite.')
        return
      }
      if (!EMAIL_PATTERN.test(trimmedEmail)) {
        setError('Enter a valid email address.')
        return
      }
    } else {
      if (!trimmedPhone) {
        setError('Enter a phone number to send the invite.')
        return
      }
      if (!E164_PATTERN.test(trimmedPhone)) {
        setError('Phone must be in international format (e.g. +15551234567).')
        return
      }
    }

    setSubmitting(true)
    try {
      const created = await api.invitations.create(
        channel === 'EMAIL'
          ? { channel: 'EMAIL', email: trimmedEmail }
          : { channel: 'SMS', phone: trimmedPhone },
      )
      setInvitation(created)
      // Open the native share sheet straight away — the recipient field is
      // pre-populated; one tap and the message ships through their messaging
      // app of choice. The success card stays mounted so the user can re-share
      // or copy the code if the sheet was dismissed.
      const joinUrl = `${WEB_BASE_URL}/join/${created.code}`
      void Share.share({
        message: buildShareMessage(created.code, joinUrl),
        url: joinUrl,
      }).catch(() => {
        // Share dismissal is not a failure — leave the success card visible.
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleShareAgain() {
    if (!invitation) return
    const joinUrl = `${WEB_BASE_URL}/join/${invitation.code}`
    try {
      await Share.share({
        message: buildShareMessage(invitation.code, joinUrl),
        url: joinUrl,
      })
    } catch {
      Alert.alert('Share unavailable', 'Could not open the share sheet on this device.')
    }
  }

  function handleSendAnother() {
    setInvitation(null)
    setEmail('')
    setPhone('')
    setError(null)
  }

  function handleClose() {
    navigation.goBack()
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView variant="screen" style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            <ThemedText style={styles.heading}>Invite a friend to WODalytics</ThemedText>
            <ThemedText variant="tertiary" style={styles.subheading}>
              We&apos;ll generate an invite code you can share over any messaging app on your phone.
            </ThemedText>

            {/* Channel toggle */}
            <View style={styles.field}>
              <ThemedText variant="label" style={styles.fieldLabel}>Send via</ThemedText>
              <View
                style={styles.chipRow}
                accessibilityRole="radiogroup"
                accessibilityLabel="Invite channel"
              >
                {CHANNEL_OPTIONS.map((option) => {
                  const active = channel === option.value
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => handleChangeChannel(option.value)}
                      disabled={submitting || invitation !== null}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, disabled: submitting || invitation !== null }}
                      style={[
                        styles.chip,
                        {
                          borderColor: colors.borderInteractive,
                          backgroundColor: active ? colors.primary : 'transparent',
                          opacity: invitation !== null ? 0.5 : 1,
                        },
                      ]}
                      testID={`channel-chip-${option.value}`}
                    >
                      <ThemedText
                        style={[styles.chipText, { color: active ? colors.onPrimary : colors.textSecondary }]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Contact input */}
            <View style={styles.field}>
              {channel === 'EMAIL' ? (
                <>
                  <ThemedText variant="label" style={styles.fieldLabel}>Email address</ThemedText>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="friend@example.com"
                    placeholderTextColor={colors.textPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!submitting && invitation === null}
                    style={[
                      styles.input,
                      { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
                    ]}
                    testID="invite-email-input"
                  />
                </>
              ) : (
                <>
                  <ThemedText variant="label" style={styles.fieldLabel}>Phone number</ThemedText>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+15551234567"
                    placeholderTextColor={colors.textPlaceholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="phone-pad"
                    editable={!submitting && invitation === null}
                    style={[
                      styles.input,
                      { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
                    ]}
                    testID="invite-phone-input"
                  />
                  <ThemedText variant="tertiary" style={styles.fieldHint}>
                    International format — include the country code (e.g. +1 for US/Canada).
                  </ThemedText>
                </>
              )}
            </View>

            {error && (
              <ThemedText
                style={[styles.error, { color: colors.errorText }]}
                testID="invite-error"
              >
                {error}
              </ThemedText>
            )}

            {invitation === null ? (
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }, submitting && styles.buttonDisabled]}
                onPress={handleSend}
                disabled={submitting}
                testID="send-invite-button"
              >
                {submitting
                  ? <ActivityIndicator color={colors.onPrimary} />
                  : <ThemedText style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Send invite</ThemedText>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.borderInteractive }]}
                onPress={handleSendAnother}
                testID="send-another-button"
              >
                <ThemedText style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
                  Invite someone else
                </ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>

          {/* Success state — code + share affordance */}
          {invitation !== null && (
            <ThemedView
              variant="card"
              style={[styles.card, styles.successCard, { borderColor: colors.primary }]}
              testID="invite-success-card"
            >
              <ThemedText variant="label" style={[styles.sectionLabel, { color: colors.primary }]}>
                INVITE READY
              </ThemedText>
              <ThemedText style={styles.code} testID="invite-code">{invitation.code}</ThemedText>
              <ThemedText variant="tertiary" style={styles.codeMeta}>
                Sent to {invitation.email ?? invitation.phone ?? 'your friend'} · expires{' '}
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </ThemedText>

              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleShareAgain}
                testID="share-again-button"
              >
                <ThemedText style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                  Share again
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tertiaryButton]}
                onPress={handleClose}
                testID="invite-done-button"
              >
                <ThemedText style={[styles.tertiaryButtonText, { color: colors.primary }]}>Done</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  successCard: {
    alignItems: 'center',
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    fontSize: 14,
  },
  primaryButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  tertiaryButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  codeMeta: {
    fontSize: 12,
    textAlign: 'center',
  },
})
