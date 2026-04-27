import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import {
  api,
  type IdentifiedGender,
  type EmergencyContact,
  type CreateEmergencyContactPayload,
} from '../lib/api'
import Button from '../components/ui/Button'
import AvatarPlaceholder from '../components/AvatarPlaceholder'
import EmergencyContactsEditor from '../components/EmergencyContactsEditor'
import { NameFields, BirthdayField, GenderField } from '../components/ProfileFields'

const STEPS = ['Your name', 'About you', 'Emergency contacts'] as const

export default function Onboarding() {
  const { user, login, accessToken } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender>>('PREFER_NOT_TO_SAY')
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setContacts(p.emergencyContacts)
      })
      .catch(() => {})
  }, [navigate])

  function step1Valid() {
    return firstName.trim().length > 0 && lastName.trim().length > 0
  }
  function step2Valid() {
    return birthday.length > 0
  }
  function step3Valid() {
    return contacts.length > 0
  }

  async function persistStep1And2() {
    await api.users.me.profile.update({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthday,
      identifiedGender: gender,
    })
  }

  async function handleNext() {
    setError(null)
    if (step === 0 && !step1Valid()) {
      setError('First and last name are required.')
      return
    }
    if (step === 1 && !step2Valid()) {
      setError('Birthday is required.')
      return
    }
    if (step === 0) {
      setStep(1)
      return
    }
    if (step === 1) {
      // Persist what we have so a refresh mid-onboarding keeps progress.
      try {
        await persistStep1And2()
        setStep(2)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      }
      return
    }
    // Step 2: finish
    if (!step3Valid()) {
      setError('Add at least one emergency contact.')
      return
    }
    setSubmitting(true)
    try {
      await persistStep1And2()
      // Refresh AuthUser so RequireOnboarded lets us through.
      if (accessToken) {
        const me = await api.auth.me(accessToken)
        login(accessToken, me)
      }
      navigate('/feed', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finish onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddContact(data: CreateEmergencyContactPayload) {
    const created = await api.users.me.emergencyContacts.create(data)
    setContacts((cs) => [...cs, created])
  }

  async function handleRemoveContact(id: string) {
    await api.users.me.emergencyContacts.remove(id)
    setContacts((cs) => cs.filter((c) => c.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest">Welcome to WODalytics</p>
          <h1 className="text-2xl font-bold">Let's set up your profile</h1>
          <p className="text-sm text-gray-400">Just a few details so trainers can give you the right standards and reach an emergency contact if needed.</p>
        </header>

        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span className={[
                'w-6 h-6 rounded-full flex items-center justify-center font-semibold',
                i === step ? 'bg-indigo-600 text-white' : i < step ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400',
              ].join(' ')}>{i + 1}</span>
              <span className={i === step ? 'text-white' : 'text-gray-400'}>{label}</span>
              {i < STEPS.length - 1 && <span className="text-gray-700 mx-1" aria-hidden="true">·</span>}
            </li>
          ))}
        </ol>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-5">
          {step === 0 && (
            <>
              <div className="flex items-center gap-3">
                <AvatarPlaceholder firstName={firstName} lastName={lastName} email={user?.email ?? ''} size="lg" />
                <div className="text-xs text-gray-400">
                  <span className="inline-block rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 mr-2">Coming soon</span>
                  Avatar upload arrives in a follow-up update.
                </div>
              </div>
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
              <p className="text-sm text-gray-300">Who should we contact in an emergency? Add at least one.</p>
              <EmergencyContactsEditor
                contacts={contacts}
                onCreate={handleAddContact}
                onRemove={handleRemoveContact}
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="tertiary"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || submitting}
            >
              ← Back
            </Button>
            <Button onClick={handleNext} disabled={submitting}>
              {step < STEPS.length - 1 ? 'Continue →' : (submitting ? 'Finishing…' : 'Finish')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
