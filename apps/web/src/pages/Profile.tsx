import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import { useTheme } from '../context/ThemeContext.tsx'
import {
  api,
  type IdentifiedGender,
  type UserProfile,
} from '../lib/api'
import Button from '../components/ui/Button'
import SegmentedControl from '../components/ui/SegmentedControl'
import AvatarUploader from '../components/AvatarUploader'
import EmergencyContactsEditor from '../components/EmergencyContactsEditor'
import MyInvitationsSection from '../components/MyInvitationsSection'
import MyJoinRequestsSection from '../components/MyJoinRequestsSection'
import MyGymsSection from '../components/MyGymsSection'
import {
  NameFields,
  BirthdayField,
  GenderField,
  GENDER_OPTIONS,
} from '../components/ProfileFields'
import type { ThemeMode } from '../lib/useTheme'

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
  { value: 'system', label: 'System' },
]

type Tab = 'details' | 'memberships'

// Hash anchors keep the active tab deep-linkable. The InvitationsBanner links
// to /profile#invitations — that lands on the Memberships tab since that's
// where invitations live now.
function readTabFromHash(): Tab {
  if (typeof window === 'undefined') return 'details'
  const h = window.location.hash
  return h === '#memberships' || h === '#invitations' ? 'memberships' : 'details'
}

export default function Profile() {
  const { user, logout } = useAuth()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<NonNullable<IdentifiedGender> | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [tab, setTab] = useState<Tab>(readTabFromHash)

  useEffect(() => {
    function onHashChange() { setTab(readTabFromHash()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    const hash = next === 'memberships' ? '#memberships' : ''
    if (hash !== window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
    }
  }

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
    return <p className="text-slate-400 dark:text-gray-400">Loading…</p>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'memberships', label: 'Gym Memberships' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-sm text-slate-500 dark:text-gray-400">Personal information used for results tracking and emergency contact.</p>
      </header>

      <div className="border-b border-slate-200 dark:border-gray-800">
        <nav className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                tab === t.id
                  ? 'border-primary text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'details' && (
        <div className="space-y-8">
          <section className="rounded-xl bg-slate-100 dark:bg-gray-900 p-4 border border-slate-200 dark:border-gray-800">
            <AvatarUploader />
          </section>

          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Personal info</h2>
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

            {error && <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>}
            {savedAt && !error && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </form>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Appearance</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-gray-400">Theme</span>
              <SegmentedControl
                aria-label="Color theme"
                options={THEME_OPTIONS}
                value={themeMode}
                onChange={setThemeMode}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-gray-300 uppercase tracking-wide">Emergency contacts</h2>
            <p className="text-xs text-slate-500 dark:text-gray-400">
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

          <section className="pt-6 border-t border-slate-200 dark:border-gray-800">
            <Button variant="secondary" onClick={handleSignOut}>
              Sign out
            </Button>
          </section>
        </div>
      )}

      {tab === 'memberships' && (
        <div className="space-y-8">
          <MyGymsSection />
          {/* Both subsections render nothing when empty (per #120 review) — the
              tab still has Your gyms above, so it never feels barren. */}
          <MyInvitationsSection />
          <MyJoinRequestsSection />
        </div>
      )}
    </div>
  )
}
