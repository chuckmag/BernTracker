import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { api, type IdentifiedGender } from '../lib/api'
import Button from '../components/ui/Button'
import AvatarUploader from '../components/AvatarUploader'
import { NameFields, BirthdayField, GenderField } from '../components/ProfileFields'

const STEPS = ['Your name', 'About you'] as const

export default function Onboarding() {
  const { login, accessToken } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender>>('PREFER_NOT_TO_SAY')
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
    // Step 1: finish — persist and exit onboarding.
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
      navigate('/feed', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finish onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950 text-slate-950 dark:text-white flex justify-center p-4 sm:p-8">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-gray-400 uppercase tracking-widest">Welcome to WODalytics</p>
          <h1 className="text-2xl font-bold">Let's set up your profile</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400">Just a few details so trainers can give you the right standards. Emergency contacts and other gym-specific info come when you join a gym.</p>
        </header>

        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span className={[
                'w-6 h-6 rounded-full flex items-center justify-center font-semibold',
                i === step ? 'bg-primary text-white' : i < step ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-gray-800 dark:text-gray-400',
              ].join(' ')}>{i + 1}</span>
              <span className={i === step ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-gray-400'}>{label}</span>
              {i < STEPS.length - 1 && <span className="text-slate-300 dark:text-gray-700 mx-1" aria-hidden="true">·</span>}
            </li>
          ))}
        </ol>

        <div className="rounded-xl bg-white border border-slate-200 dark:bg-gray-900 dark:border-gray-800 p-5 space-y-5">
          {step === 0 && (
            <>
              <AvatarUploader
                size="lg"
                helper={<p className="text-sm text-slate-950 dark:text-white">Add a photo (optional)</p>}
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
