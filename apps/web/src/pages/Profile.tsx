import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import {
  api,
  type IdentifiedGender,
  type UserProfile,
} from '../lib/api'
import Button from '../components/ui/Button'
import AvatarPlaceholder from '../components/AvatarPlaceholder'
import EmergencyContactsEditor from '../components/EmergencyContactsEditor'
import {
  NameFields,
  BirthdayField,
  GenderField,
  GENDER_OPTIONS,
} from '../components/ProfileFields'

export default function Profile() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender> | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    api.users.me.profile.get()
      .then((p) => {
        setProfile(p)
        setFirstName(p.firstName ?? '')
        setLastName(p.lastName ?? '')
        setBirthday(p.birthday ? p.birthday.slice(0, 10) : '')
        setGender(p.identifiedGender ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await api.users.me.profile.update({
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        birthday: birthday || null,
        identifiedGender: gender || null,
      })
      setProfile(updated)
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (!profile) {
    return <p className="text-gray-400">Loading…</p>
  }

  return (
    <div className="max-w-2xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-sm text-gray-400">Personal information used for results tracking and emergency contact.</p>
      </header>

      <section className="flex items-center gap-4 rounded-xl bg-gray-900 p-4 border border-gray-800">
        <AvatarPlaceholder firstName={firstName} lastName={lastName} email={user?.email ?? ''} size="lg" />
        <div className="space-y-1">
          <p className="text-sm text-white">Profile photo</p>
          <p className="text-xs text-gray-400">
            <span className="inline-block rounded bg-amber-500/20 text-amber-300 px-2 py-0.5 mr-2">Coming soon</span>
            Avatar uploads will arrive in a follow-up update.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Personal info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NameFields
              firstName={firstName}
              lastName={lastName}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
            />
            <BirthdayField value={birthday} onChange={setBirthday} />
            <GenderField
              value={(gender as NonNullable<IdentifiedGender>) || GENDER_OPTIONS[0].value}
              onChange={setGender}
            />
          </div>
        </section>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {savedAt && !error && <p className="text-sm text-emerald-400">Saved.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Emergency contacts</h2>
        <p className="text-xs text-gray-400">
          Optional. Stored on your account today; gym-specific contacts will come with the gym onboarding flow.
        </p>
        <EmergencyContactsEditor
          contacts={profile.emergencyContacts}
          onCreate={async (data) => {
            const created = await api.users.me.emergencyContacts.create(data)
            setProfile((p) => p ? { ...p, emergencyContacts: [...p.emergencyContacts, created] } : p)
          }}
          onRemove={async (id) => {
            await api.users.me.emergencyContacts.remove(id)
            setProfile((p) => p ? { ...p, emergencyContacts: p.emergencyContacts.filter((c) => c.id !== id) } : p)
          }}
        />
      </section>

      <section className="pt-6 border-t border-gray-800">
        <Button variant="secondary" onClick={handleSignOut}>
          Sign out
        </Button>
      </section>
    </div>
  )
}
