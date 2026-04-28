import { useEffect, useState } from 'react'
import { api, type Gym, type GymProgram, type PendingMovement } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useMovements } from '../context/MovementsContext.tsx'
import MembersTab from '../components/MembersTab'

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
  const { user } = useAuth()
  const allMovements = useMovements()
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

  // Pending movement review state (reviewer only)
  const [pendingMovements, setPendingMovements] = useState<PendingMovement[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mvEditName, setMvEditName] = useState('')
  const [editParentId, setEditParentId] = useState<string | null>(null)
  const [parentSearch, setParentSearch] = useState('')
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!user?.isMovementReviewer) return
    setPendingLoading(true)
    api.movements.pending()
      .then(setPendingMovements)
      .catch(() => {})
      .finally(() => setPendingLoading(false))
  }, [user?.isMovementReviewer])

  function startEditing(m: PendingMovement) {
    setEditingId(m.id)
    setMvEditName(m.name)
    setEditParentId(m.parentId)
    setParentSearch(m.parentId ? (allMovements.find((a) => a.id === m.parentId)?.name ?? '') : '')
    setParentDropdownOpen(false)
  }

  function cancelEditing() {
    setEditingId(null)
    setMvEditName('')
    setEditParentId(null)
    setParentSearch('')
    setParentDropdownOpen(false)
  }

  async function handleSaveEdit(id: string) {
    setSavingEdit(true)
    try {
      const updated = await api.movements.update(id, { name: mvEditName, parentId: editParentId })
      setPendingMovements((prev) => prev.map((m) => m.id === id ? updated : m))
      cancelEditing()
    } catch {
      // leave form open so user can retry
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleReview(id: string, status: 'ACTIVE' | 'REJECTED') {
    setReviewingId(id)
    try {
      await api.movements.review(id, status)
      setPendingMovements((prev) => prev.filter((m) => m.id !== id))
    } catch {
      // leave in list; user can retry
    } finally {
      setReviewingId(null)
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
            <label className="block text-sm text-gray-400 mb-1">Gym Name</label>
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Timezone</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
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
    return <p className="text-gray-400">Loading…</p>
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
      <div className="border-b border-gray-800">
        <nav className="flex gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                tab === t.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'details' && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Gym Details</h2>
          <form onSubmit={handleSaveGym} className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gym Name</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Timezone</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
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
      )}

      {tab === 'members' && <MembersTab />}

      {/* Programs and Pending Movements live below the tabs for now. The
          follow-up issue (see PR description) moves them into their own
          dedicated places so /gym-settings is a pure tab UI. */}

      {/* Programs */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Programs</h2>
          <button
            onClick={() => setShowProgramForm((v) => !v)}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm"
          >
            {showProgramForm ? 'Cancel' : 'Add Program'}
          </button>
        </div>

        {showProgramForm && (
          <form onSubmit={handleAddProgram} className="space-y-3 max-w-sm mb-6 p-4 bg-gray-800 rounded">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                value={progDesc}
                onChange={(e) => setProgDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Date</label>
              <input
                type="date"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                value={progStart}
                onChange={(e) => setProgStart(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Date (optional)</label>
              <input
                type="date"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
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
          <p className="text-gray-500 text-sm">No programs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 pr-4">Name</th>
                <th className="text-left py-2 pr-4">Start Date</th>
                <th className="text-left py-2">End Date</th>
              </tr>
            </thead>
            <tbody>
              {programs.map(({ program }) => (
                <tr key={program.id} className="border-b border-gray-800">
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

      {/* Pending Movement Review — reviewer only */}
      {user?.isMovementReviewer && (
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Pending Movements
            {pendingMovements.length > 0 && (
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                {pendingMovements.length}
              </span>
            )}
          </h2>

          {pendingLoading && <p className="text-sm text-gray-400">Loading…</p>}

          {!pendingLoading && pendingMovements.length === 0 && (
            <p className="text-sm text-gray-500">No pending movements.</p>
          )}

          {pendingMovements.length > 0 && (
            <div className="space-y-2">
              {pendingMovements.map((m) => {
                const isEditing = editingId === m.id
                const parentSearchResults = parentSearch.trim()
                  ? allMovements
                      .filter((a) => a.name.toLowerCase().includes(parentSearch.toLowerCase()) && a.id !== m.id)
                      .slice(0, 8)
                  : []
                const selectedParentName = editParentId ? allMovements.find((a) => a.id === editParentId)?.name : null

                if (isEditing) {
                  return (
                    <div key={m.id} className="px-4 py-3 rounded-lg bg-gray-900 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Name</label>
                        <input
                          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                          value={mvEditName}
                          onChange={(e) => setMvEditName(e.target.value)}
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-xs text-gray-400 mb-1">Parent movement (optional)</label>
                        {selectedParentName ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 text-xs">{selectedParentName}</span>
                            <button
                              type="button"
                              onClick={() => { setEditParentId(null); setParentSearch('') }}
                              className="text-xs text-gray-400 hover:text-gray-200"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <input
                            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                            placeholder="Search movements…"
                            value={parentSearch}
                            onChange={(e) => { setParentSearch(e.target.value); setParentDropdownOpen(true) }}
                            onFocus={() => setParentDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setParentDropdownOpen(false), 150)}
                          />
                        )}
                        {parentDropdownOpen && parentSearchResults.length > 0 && (
                          <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
                            {parentSearchResults.map((a) => (
                              <li
                                key={a.id}
                                onMouseDown={() => { setEditParentId(a.id); setParentSearch(a.name); setParentDropdownOpen(false) }}
                                className="px-3 py-2 text-sm text-white hover:bg-gray-700 cursor-pointer"
                              >
                                {a.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveEdit(m.id)}
                          disabled={savingEdit || !mvEditName.trim()}
                          className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                        >
                          {savingEdit ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={savingEdit}
                          className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-900">
                    <div>
                      <span className="text-sm text-white">{m.name}</span>
                      {m.parentId && (
                        <span className="ml-2 text-xs text-gray-400">
                          variation of {allMovements.find((a) => a.id === m.parentId)?.name ?? 'unknown'}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(m)}
                        disabled={reviewingId === m.id}
                        className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleReview(m.id, 'ACTIVE')}
                        disabled={reviewingId === m.id}
                        className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReview(m.id, 'REJECTED')}
                        disabled={reviewingId === m.id}
                        className="px-3 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
