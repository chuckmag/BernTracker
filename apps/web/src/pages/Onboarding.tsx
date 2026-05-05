import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { api, type IdentifiedGender, type PendingInvitation } from '../lib/api'
import Button from '../components/ui/Button'
import AvatarUploader from '../components/AvatarUploader'
import { NameFields, BirthdayField, GenderField } from '../components/ProfileFields'

const PROFILE_STEPS = ['Your name', 'About you'] as const

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  PROGRAMMER: 'Programmer',
  COACH: 'Coach',
  MEMBER: 'Member',
}

function formatInviter(
  invitedBy: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string } | null,
): string {
  if (!invitedBy) return 'a staff member'
  const first = invitedBy.firstName?.trim()
  const last = invitedBy.lastName?.trim()
  if (first && last) return `${first} ${last}`
  if (first) return first
  if (invitedBy.name?.trim()) return invitedBy.name.trim()
  return invitedBy.email ?? 'a staff member'
}

export default function Onboarding() {
  const { login, accessToken } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // Profile fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender>>('PREFER_NOT_TO_SAY')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Invitations step — shown when there are pending gym invites after profile save
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [inviteActingOn, setInviteActingOn] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const steps =
    step >= 2 ? ([...PROFILE_STEPS, 'Join a gym'] as const) : PROFILE_STEPS

  // Pre-fill from existing user record (handles re-entry mid-onboarding).
  useEffect(() => {
    api.users.me.profile.get()
      .then((p) => {
        if (p.onboardedAt) {
          navigate('/feed', { replace: true })
          return
        }
        if (p.firstName) setFirstName(p.firstName)
        else if (p.name) {
          const [first, ...rest] = p.name.trim().split(/\s+/)
          setFirstName(first ?? '')
          if (rest.length > 0) setLastName(rest.join(' '))
        }
        if (p.lastName) setLastName(p.lastName)
        if (p.birthday) setBirthday(p.birthday.slice(0, 10))
        if (p.identifiedGender) setGender(p.identifiedGender)
      })
      .catch(() => {})
  }, [navigate])

  function step1Valid() {
    return firstName.trim().length > 0 && lastName.trim().length > 0
  }
  function step2Valid() {
    return birthday.length > 0
  }

  async function handleNext() {
    setError(null)
    if (step === 0) {
      if (!step1Valid()) {
        setError('First and last name are required.')
        return
      }
      setStep(1)
      return
    }

    if (step === 1) {
      if (!step2Valid()) {
        setError('Birthday is required.')
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
        // Refresh AuthUser so RequireOnboarded lets us through.
        if (accessToken) {
          const me = await api.auth.me(accessToken)
          login(accessToken, me)
        }
        // Check for pending gym invitations before navigating to the feed.
        const pending = await api.users.me.invitations.pendingAll()
        const gymPending = pending.filter(
          (item) =>
            (item.kind === 'membershipRequest' && item.data.gymId) ||
            (item.kind === 'invitation' && !!item.data.gymId),
        )
        if (gymPending.length > 0) {
          setPendingInvitations(gymPending)
          setStep(2)
        } else {
          navigate('/feed', { replace: true })
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to finish onboarding')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Step 2: invitations done — go to feed
    navigate('/feed', { replace: true })
  }

  async function handleInviteAction(action: 'accept' | 'decline', item: PendingInvitation) {
    const key = item.kind === 'membershipRequest' ? item.data.id : `code-${item.data.code}`
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
      setPendingInvitations((prev) => prev.filter((i) => i !== item))
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : `Failed to ${action} invitation`)
    } finally {
      setInviteActingOn(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Welcome to WODalytics</p>
          <h1 className="text-2xl font-bold">Let's set up your profile</h1>
          <p className="text-sm text-gray-400">Just a few details so trainers can give you the right standards. Emergency contacts and other gym-specific info come when you join a gym.</p>
        </header>

        <ol className="flex items-center gap-2 text-xs">
          {steps.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span className={[
                'w-6 h-6 rounded-full flex items-center justify-center font-semibold',
                i === step ? 'bg-indigo-600 text-white' : i < step ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400',
              ].join(' ')}>{i + 1}</span>
              <span className={i === step ? 'text-white' : 'text-gray-400'}>{label}</span>
              {i < steps.length - 1 && <span className="text-gray-700 mx-1" aria-hidden="true">·</span>}
            </li>
          ))}
        </ol>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-5">
          {step === 0 && (
            <>
              <AvatarUploader
                size="lg"
                helper={<p className="text-sm text-white">Add a photo (optional)</p>}
              />
              <NameFields
                firstName={firstName}
                lastName={lastName}
                onFirstNameChange={setFirstName}
                onLastNameChange={setLastName}
                autoFocus
              />
            </>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <BirthdayField
                value={birthday}
                onChange={setBirthday}
                helperText="Used to determine your age category for results."
              />
              <GenderField
                value={gender}
                onChange={setGender}
                helperText="Self-identified — used for default leaderboard grouping. You can override per result."
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">You've been invited to a gym!</p>
                <p className="text-xs text-gray-400">Accept or decline below. You can always manage invitations from your profile.</p>
              </div>
              {pendingInvitations.length === 0 ? (
                <p className="text-sm text-gray-400">All done — click Continue to get started.</p>
              ) : (
                <ul className="space-y-3">
                  {pendingInvitations.map((item) => {
                    const key = item.kind === 'membershipRequest'
                      ? item.data.id
                      : `code-${item.data.code}`
                    const gymName = item.kind === 'membershipRequest'
                      ? item.data.gym.name
                      : item.data.gym?.name ?? null
                    const roleToGrant = item.data.roleToGrant
                    const inviterLabel = item.kind === 'membershipRequest'
                      ? formatInviter(item.data.invitedBy)
                      : formatInviter(item.data.invitedBy)
                    return (
                      <li key={key} className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-3">
                        <div className="space-y-1">
                          <p className="text-sm text-white">
                            <span className="font-semibold">{gymName ?? 'Unknown gym'}</span>
                            <span className="text-gray-400"> · as </span>
                            <span className="text-indigo-300">{ROLE_LABEL[roleToGrant] ?? roleToGrant}</span>
                          </p>
                          <p className="text-xs text-gray-400">From {inviterLabel}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleInviteAction('accept', item)}
                            disabled={!!inviteActingOn}
                          >
                            {inviteActingOn === key ? 'Accepting…' : 'Accept'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleInviteAction('decline', item)}
                            disabled={!!inviteActingOn}
                          >
                            Decline
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {inviteError && <p className="text-sm text-rose-400">{inviteError}</p>}
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="tertiary"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting || step === 2}
            >
              ← Back
            </Button>
            <Button onClick={handleNext} disabled={submitting || !!inviteActingOn}>
              {step === 0
                ? 'Continue →'
                : step === 1
                  ? (submitting ? 'Saving…' : 'Finish')
                  : 'Go to feed →'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
