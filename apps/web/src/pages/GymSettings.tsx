import { useEffect, useState } from 'react'
import { api, type Gym, type GymProgram } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import MembersTab from '../components/MembersTab'
import GymLogoUploader from '../components/GymLogoUploader'

type Tab = 'details' | 'members'

// Hash anchors keep the active tab deep-linkable. /members redirects here to
// #members so old bookmarks land on the right tab.
function readTabFromHash(): Tab {
  if (typeof window === 'undefined') return 'details'
  return window.location.hash === '#members' ? 'members' : 'details'
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
]

export default function GymSettings() {
  const { gymId, setGymId } = useGym()
  const [tab, setTab] = useState<Tab>(readTabFromHash)

  // Listen for hash changes so back/forward and external links pick the right tab.
  useEffect(() => {
    function onHashChange() { setTab(readTabFromHash()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    const hash = next === 'members' ? '#members' : ''
    if (hash !== window.location.hash) {
      // replaceState avoids cluttering history with tab switches.
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
    }
  }

  const [gym, setGym] = useState<Gym | null>(null)
  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create gym form
  const [createName, setCreateName] = useState('')
  const [createTz, setCreateTz] = useState('UTC')

  // Edit gym form
  const [editName, setEditName] = useState('')
  const [editTz, setEditTz] = useState('UTC')
  const [saving, setSaving] = useState(false)

  // Add program form
  const [showProgramForm, setShowProgramForm] = useState(false)
  const [progName, setProgName] = useState('')
  const [progDesc, setProgDesc] = useState('')
  const [progStart, setProgStart] = useState('')
  const [progEnd, setProgEnd] = useState('')
  const [addingProg, setAddingProg] = useState(false)

  useEffect(() => {
    if (!gymId) return
    loadGym()
  }, [gymId])

  async function loadGym() {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const [g, progs] = await Promise.all([api.gyms.get(gymId), api.gyms.programs.list(gymId)])
      setGym(g)
      setEditName(g.name)
      setEditTz(g.timezone)
      setPrograms(progs)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateGym(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const g = await api.gyms.create({ name: createName, timezone: createTz })
      setGymId(g.id)
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  async function handleSaveGym(e: React.FormEvent) {
    e.preventDefault()
    if (!gymId) return
    setSaving(true)
    setError(null)
    try {
      const g = await api.gyms.update(gymId, { name: editName, timezone: editTz })
      setGym(g)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddProgram(e: React.FormEvent) {
    e.preventDefault()
    if (!gymId) return
    setAddingProg(true)
    setError(null)
    try {
      await api.gyms.programs.create(gymId, {
        name: progName,
        description: progDesc || undefined,
        startDate: progStart,
        endDate: progEnd || undefined,
      })
      setProgName('')
      setProgDesc('')
      setProgStart('')
      setProgEnd('')
      setShowProgramForm(false)
      await loadGym()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAddingProg(false)
    }
  }

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Create Your Gym</h1>
        {error && <p className="text-red-400 mb-4">{error}</p>}
        <form onSubmit={handleCreateGym} className="space-y-4 max-w-sm">
          <div>
            <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Gym Name</label>
            <input
              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-slate-950 dark:text-white"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Timezone</label>
            <select
              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-slate-950 dark:text-white"
              value={createTz}
              onChange={(e) => setCreateTz(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-white"
          >
            {loading ? 'Creating…' : 'Create Gym'}
          </button>
        </form>
      </div>
    )
  }

  if (loading && !gym) {
    return <p className="text-slate-500 dark:text-gray-400">Loading…</p>
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'members', label: 'Members' },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Gym Settings</h1>
      {error && <p className="text-red-400">{error}</p>}

      {/* Tabs */}
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
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950',
                tab === t.id
                  ? 'border-indigo-500 text-slate-950 dark:text-white'
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
          {gym && (
            <section className="rounded-xl bg-white dark:bg-gray-900 p-4 border border-slate-200 dark:border-gray-800">
              <GymLogoUploader
                gymId={gym.id}
                logoUrl={gym.logoUrl}
                name={gym.name}
                onChange={(logoUrl) => setGym((g) => g ? { ...g, logoUrl } : g)}
              />
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold mb-4">Gym Details</h2>
            <form onSubmit={handleSaveGym} className="space-y-4 max-w-sm">
              <div>
                <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Gym Name</label>
                <input
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-slate-950 dark:text-white"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Timezone</label>
                <select
                  className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-slate-950 dark:text-white"
                  value={editTz}
                  onChange={(e) => setEditTz(e.target.value)}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-white"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </section>
        </div>
      )}

      {tab === 'members' && <MembersTab />}

      {/* Programs lives below the tabs for now. A follow-up issue moves
          this into its own dedicated place so /gym-settings is a pure tab
          UI. (Pending Movements moved to /admin/movements — accessible from
          the Settings sidebar entry for WODalytics admins only.) */}

      {/* Programs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Programs</h2>
          <button
            onClick={() => setShowProgramForm((v) => !v)}
            className="bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-white px-3 py-1.5 rounded text-sm"
          >
            {showProgramForm ? 'Cancel' : 'Add Program'}
          </button>
        </div>

        {showProgramForm && (
          <form onSubmit={handleAddProgram} className="space-y-3 max-w-sm mb-6 p-4 bg-slate-100 dark:bg-gray-800 rounded">
            <div>
              <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Name</label>
              <input
                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded px-3 py-2 text-slate-950 dark:text-white"
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Description</label>
              <input
                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded px-3 py-2 text-slate-950 dark:text-white"
                value={progDesc}
                onChange={(e) => setProgDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded px-3 py-2 text-slate-950 dark:text-white"
                value={progStart}
                onChange={(e) => setProgStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-500 dark:text-gray-400 mb-1">End Date (optional)</label>
              <input
                type="date"
                className="w-full bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded px-3 py-2 text-slate-950 dark:text-white"
                value={progEnd}
                onChange={(e) => setProgEnd(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={addingProg}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-white text-sm"
            >
              {addingProg ? 'Adding…' : 'Add Program'}
            </button>
          </form>
        )}

        {programs.length === 0 ? (
          <p className="text-slate-400 dark:text-gray-500 text-sm">No programs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 dark:text-gray-400 border-b border-slate-300 dark:border-gray-700">
                <th className="text-left py-2 pr-4">Name</th>
                <th className="text-left py-2 pr-4">Start Date</th>
                <th className="text-left py-2">End Date</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(({ program }) => (
                <tr key={program.id} className="border-b border-slate-200 dark:border-gray-800">
                  <td className="py-2 pr-4">{program.name}</td>
                  <td className="py-2 pr-4">{new Date(program.startDate).toLocaleDateString()}</td>
                  <td className="py-2">
                    {program.endDate ? new Date(program.endDate).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  )
}
