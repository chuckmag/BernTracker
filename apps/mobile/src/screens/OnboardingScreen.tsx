import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
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
import {
  api,
  type IdentifiedGender,
  type PendingInvitation,
  type Role,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'
import AvatarUploader from '../components/AvatarUploader'
import BirthdayField from '../components/BirthdayField'
import type { OnboardingStackParamList } from '../../App'

// Mirror of apps/web/src/pages/Onboarding.tsx. Three sequential steps:
//   0 — name (firstName + lastName)
//   1 — birthday + identifiedGender
//   2 — pending gym invitations (only shown if the API returns ≥1)
// Step 1's submit calls PATCH /api/users/me/profile; the server's
// `maybeMarkOnboarded` flips `onboardedAt` once the four required fields
// are set, after which `refreshUser()` unblocks the RootNavigator gate.

const GENDER_OPTIONS: { value: NonNullable<IdentifiedGender>; label: string }[] = [
  { value: 'FEMALE',            label: 'Female' },
  { value: 'MALE',              label: 'Male' },
  { value: 'NON_BINARY',        label: 'Non-binary' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
]

const ROLE_LABEL: Record<Role, string> = {
  OWNER:      'Owner',
  PROGRAMMER: 'Programmer',
  COACH:      'Coach',
  MEMBER:     'Member',
}

function formatInviter(
  invitedBy: { firstName: string | null; lastName: string | null; name?: string | null; email?: string } | null,
): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (invitedBy.name?.trim()) return invitedBy.name.trim()
  return invitedBy.email ?? 'a staff member'
}

function invitationKey(item: PendingInvitation): string {
  return item.kind === 'membershipRequest' ? item.data.id : `code-${item.data.code}`
}

type Nav = StackNavigationProp<OnboardingStackParamList, 'Onboarding'>

export default function OnboardingScreen() {
  const { user, refreshUser } = useAuth()
  const { colors } = useTheme()
  const navigation = useNavigation<Nav>()

  const [step, setStep] = useState<0 | 1 | 2>(0)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender>>('PREFER_NOT_TO_SAY')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [inviteActingOn, setInviteActingOn] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Pre-fill from the existing profile so a partially-onboarded user doesn't
  // start from scratch after a logout/reinstall.
  useEffect(() => {
    let cancelled = false
    api.users.me.profile.get()
      .then((p) => {
        if (cancelled) return
        if (p.firstName) setFirstName(p.firstName)
        else if (p.name) {
          const [first, ...rest] = p.name.trim().split(/\s+/)
          if (first) setFirstName(first)
          if (rest.length > 0) setLastName(rest.join(' '))
        }
        if (p.lastName) setLastName(p.lastName)
        if (p.birthday) setBirthday(p.birthday.slice(0, 10))
        if (p.identifiedGender) setGender(p.identifiedGender)
      })
      .catch(() => {
        // Pre-fill is best-effort — if the call fails the user can still
        // complete the form from scratch.
      })
    return () => { cancelled = true }
  }, [])

  function step0Valid(): boolean {
    return firstName.trim().length > 0 && lastName.trim().length > 0
  }

  function step1Valid(): boolean {
    return birthday.length > 0
  }

  async function handleNext() {
    setError(null)

    if (step === 0) {
      if (!step0Valid()) {
        setError('First and last name are required.')
        return
      }
      setStep(1)
      return
    }

    if (step === 1) {
      if (!step1Valid()) {
        setError('Please pick your birthday.')
        return
      }
      setSubmitting(true)
      try {
        await api.users.me.profile.update({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthday,
          identifiedGender: gender,
        })

        // Defer refreshUser() until step 2 lets the user act on invitations or
        // browse the public gym catalog — calling it here would flip
        // user.onboardedAt to non-null and trip RootNavigator into MainTabs
        // before we get a chance to surface the gym-joining options. The
        // pre-existing OnboardingStack keeps the user inside this flow even
        // after `maybeMarkOnboarded` runs on the server.
        const pending = await api.users.me.invitations.pendingAll().catch(() => [] as PendingInvitation[])
        setPendingInvitations(pending.filter((item) => !!item.data.gymId))
        setStep(2)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to finish onboarding')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Step 2: invitations/browse handled — refresh AuthUser so the now-non-null
    // onboardedAt lets RootNavigator route into MainTabs. A user who hasn't
    // joined any gym yet still gets through; gym-less MainTabs is a separate
    // gap (existing dead-end, not introduced here).
    await refreshUser()
  }

  async function handleInviteAction(action: 'accept' | 'decline', item: PendingInvitation) {
    const key = invitationKey(item)
    setInviteActingOn(key)
    setInviteError(null)
    try {
      if (action === 'accept') {
        if (item.kind === 'membershipRequest') {
          await api.users.me.invitations.accept(item.data.id)
        } else {
          await api.users.me.codeInvitations.accept(item.data.code)
        }
      } else {
        if (item.kind === 'membershipRequest') {
          await api.users.me.invitations.decline(item.data.id)
        } else {
          await api.users.me.codeInvitations.decline(item.data.code)
        }
      }
      setPendingInvitations((prev) => prev.filter((i) => invitationKey(i) !== key))
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : `Failed to ${action} invitation`)
    } finally {
      setInviteActingOn(null)
    }
  }

  const stepLabels = step >= 2 ? ['Your name', 'About you', 'Join a gym'] : ['Your name', 'About you']

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ThemedView variant="screen" style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText variant="tertiary" style={styles.eyebrow}>Welcome to WODalytics</ThemedText>
            <ThemedText style={styles.title}>Let's set up your profile</ThemedText>
            <ThemedText variant="tertiary" style={styles.subtitle}>
              Just a few details so trainers can give you the right standards. You can change any of this later from Profile.
            </ThemedText>
          </View>

          {/* Step indicator */}
          <View style={styles.stepRow}>
            {stepLabels.map((label, i) => {
              const done = i < step
              const active = i === step
              return (
                <View key={label} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor: done
                          ? colors.successText
                          : active
                            ? colors.primary
                            : colors.borderInteractive,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.stepDotText, { color: colors.onPrimary }]}>{i + 1}</ThemedText>
                  </View>
                  <ThemedText
                    variant={active ? 'primary' : 'tertiary'}
                    style={styles.stepLabel}
                  >
                    {label}
                  </ThemedText>
                </View>
              )
            })}
          </View>

          <ThemedView variant="card" style={[styles.card, { borderColor: colors.borderSubtle }]}>
            {step === 0 && (
              <View style={styles.fieldGroup}>
                <AvatarUploader size="lg" helper="Add a photo (optional)" />
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
                    autoFocus
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
              </View>
            )}

            {step === 1 && (
              <View style={styles.fieldGroup}>
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
              </View>
            )}

            {step === 2 && (
              <View style={styles.fieldGroup}>
                <View>
                  <ThemedText style={styles.invitesHeading}>
                    {pendingInvitations.length > 0 ? 'You\'ve been invited to a gym!' : 'Find your gym'}
                  </ThemedText>
                  <ThemedText variant="tertiary" style={styles.fieldHint}>
                    {pendingInvitations.length > 0
                      ? 'Accept or decline below, or search for a different gym. You can always manage memberships from Profile later.'
                      : 'No invitations yet. Browse the gym catalog and send a request — staff will approve you.'}
                  </ThemedText>
                </View>

                {pendingInvitations.length === 0 ? null : (
                  pendingInvitations.map((item) => {
                    const key = invitationKey(item)
                    const gymName = item.kind === 'membershipRequest'
                      ? item.data.gym.name
                      : item.data.gym?.name ?? 'Unknown gym'
                    const inviterLabel = formatInviter(item.data.invitedBy)
                    const role = item.data.roleToGrant
                    const acting = inviteActingOn === key
                    return (
                      <View
                        key={key}
                        style={[styles.inviteCard, { borderColor: colors.borderInteractive, backgroundColor: colors.inputBg }]}
                        testID={`invite-${key}`}
                      >
                        <ThemedText style={styles.inviteGymName}>
                          {gymName}
                          <ThemedText variant="tertiary"> · as </ThemedText>
                          <ThemedText style={{ color: colors.accent }}>{ROLE_LABEL[role]}</ThemedText>
                        </ThemedText>
                        <ThemedText variant="tertiary" style={styles.fieldHint}>From {inviterLabel}</ThemedText>
                        <View style={styles.inviteButtons}>
                          <TouchableOpacity
                            style={[styles.inviteButtonPrimary, { backgroundColor: colors.primary }, acting && styles.buttonDisabled]}
                            onPress={() => handleInviteAction('accept', item)}
                            disabled={!!inviteActingOn}
                            testID={`invite-accept-${key}`}
                          >
                            <ThemedText style={[styles.inviteButtonPrimaryText, { color: colors.onPrimary }]}>
                              {acting ? 'Accepting…' : 'Accept'}
                            </ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.inviteButtonSecondary, { borderColor: colors.borderInteractive }, acting && styles.buttonDisabled]}
                            onPress={() => handleInviteAction('decline', item)}
                            disabled={!!inviteActingOn}
                            testID={`invite-decline-${key}`}
                          >
                            <ThemedText style={[styles.inviteButtonSecondaryText, { color: colors.textSecondary }]}>
                              Decline
                            </ThemedText>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )
                  })
                )}

                {inviteError && (
                  <ThemedText style={[styles.error, { color: colors.errorText }]}>{inviteError}</ThemedText>
                )}

                <TouchableOpacity
                  style={[styles.findGymButton, { borderColor: colors.borderInteractive }]}
                  onPress={() => navigation.navigate('BrowseGyms')}
                  testID="find-gym-button"
                >
                  <ThemedText style={[styles.findGymButtonText, { color: colors.primary }]}>
                    {pendingInvitations.length > 0 ? 'Find another gym' : 'Browse gyms →'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {error && (
              <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>
            )}

            <View style={styles.actionRow}>
              {step > 0 && step !== 2 && (
                <TouchableOpacity
                  style={[styles.backButton, { borderColor: colors.borderInteractive }]}
                  onPress={() => { setError(null); setStep((s) => (s === 1 ? 0 : s)) }}
                  disabled={submitting}
                  testID="back-button"
                >
                  <ThemedText style={[styles.backButtonText, { color: colors.textSecondary }]}>← Back</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.nextButton,
                  { backgroundColor: colors.primary },
                  (submitting || !!inviteActingOn) && styles.buttonDisabled,
                ]}
                onPress={handleNext}
                disabled={submitting || !!inviteActingOn}
                testID="next-button"
              >
                {submitting
                  ? <ActivityIndicator color={colors.onPrimary} />
                  : (
                    <ThemedText style={[styles.nextButtonText, { color: colors.onPrimary }]}>
                      {step === 0 ? 'Continue →' : step === 1 ? 'Finish' : 'Go to app →'}
                    </ThemedText>
                  )}
              </TouchableOpacity>
            </View>
          </ThemedView>

          <ThemedText variant="tertiary" style={styles.helperFooter}>
            Signed in as {user?.email ?? 'an authenticated user'}.
          </ThemedText>
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
    padding: 20,
    gap: 20,
  },
  header: {
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepLabel: {
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 20,
  },
  fieldGroup: {
    gap: 16,
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
  invitesHeading: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  inviteCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  inviteGymName: {
    fontSize: 14,
    fontWeight: '600',
  },
  inviteButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inviteButtonPrimary: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inviteButtonPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inviteButtonSecondary: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inviteButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  findGymButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  findGymButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  nextButton: {
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flex: 1,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    fontSize: 14,
    textAlign: 'center',
  },
  helperFooter: {
    fontSize: 12,
    textAlign: 'center',
  },
})
