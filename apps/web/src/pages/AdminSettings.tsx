import { useEffect, useState } from 'react'
import { api, type PendingMovement, type Program } from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import { useMovements } from '../context/MovementsContext.tsx'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ProgramList from '../components/ProgramList'

/**
 * WODalytics admin Settings page (#160). Mirrors the `GymSettings` shape:
 * one page with hash-anchor tabs. The two tabs are:
 *   - Programs   (default — list of unaffiliated/public-catalog programs)
 *   - Movements  (pending-movement review)
 *
 * The /admin/programs/:id detail page stays separate (parallel to clicking
 * a member detail in the Members tab of GymSettings — a click leaves the
 * tabbed page entirely). Server gates every endpoint via
 * `requireWodalyticsAdmin`; the sidebar additionally hides the link.
 */

type Tab = 'programs' | 'movements'

function readTabFromHash(): Tab {
  if (typeof window === 'undefined') return 'programs'
  return window.location.hash === '#movements' ? 'movements' : 'programs'
}

export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>(readTabFromHash)

  // Listen for hash changes so back/forward and external links pick the right tab.
  useEffect(() => {
    function onHashChange() { setTab(readTabFromHash()) }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    const hash = next === 'movements' ? '#movements' : ''
    if (hash !== window.location.hash) {
      // replaceState avoids cluttering history with tab switches.
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'programs',  label: 'Programs'  },
    { id: 'movements', label: 'Movements' },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">WODalytics Settings</h1>

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

      {tab === 'programs' && <ProgramsTab />}
      {tab === 'movements' && <MovementsTab />}
    </div>
  )
}

// ─── Programs tab ─────────────────────────────────────────────────────────────

function ProgramsTab() {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const signal = { cancelled: false }
    load(signal)
    return () => { signal.cancelled = true }
  }, [])

  async function load(signal?: { cancelled: boolean }) {
    setLoading(true)
    setError(null)
    try {
      const list = await adminProgramScope.list()
      if (!signal?.cancelled) setPrograms(list)
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  return (
    <ProgramList
      scope={adminProgramScope}
      items={programs.map((p) => ({ program: p }))}
      loading={loading}
      error={error}
      detailBasePath="/admin/programs"
      onCreated={load}
      description="Unaffiliated programs surfaced from public sources (e.g. CrossFit Mainsite). Editable by WODalytics staff."
      emptyTitle="No unaffiliated programs"
      emptyBody="Programs imported from external sources will appear here once an ingest job runs — or create one yourself."
    />
  )
}

// ─── Movements tab ────────────────────────────────────────────────────────────

function MovementsTab() {
  const allMovements = useMovements()
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
    setPendingLoading(true)
    api.movements.pending()
      .then(setPendingMovements)
      .catch(() => {})
      .finally(() => setPendingLoading(false))
  }, [])

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

  return (
    <section>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Pending Movements</h2>
          {pendingMovements.length > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-sm px-2 py-0.5 rounded-full">
              {pendingMovements.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          Member-suggested movements awaiting review. Approve to make them available across all gyms, edit to fix the name or parent before approving, or reject to discard.
        </p>
      </div>

      {pendingLoading && <Skeleton variant="feed-row" count={3} />}

      {!pendingLoading && pendingMovements.length === 0 && (
        <EmptyState
          title="No pending movements"
          body="Member-suggested movements that need review will appear here."
        />
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
                <div key={m.id} className="px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 space-y-3">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">Name</label>
                    <input
                      className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white"
                      value={mvEditName}
                      onChange={(e) => setMvEditName(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">Parent movement (optional)</label>
                    {selectedParentName ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/30 text-primary text-xs">{selectedParentName}</span>
                        <button
                          type="button"
                          onClick={() => { setEditParentId(null); setParentSearch('') }}
                          className="text-xs text-slate-400 dark:text-gray-400 hover:text-slate-950 dark:hover:text-gray-200"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500"
                        placeholder="Search movements…"
                        value={parentSearch}
                        onChange={(e) => { setParentSearch(e.target.value); setParentDropdownOpen(true) }}
                        onFocus={() => setParentDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setParentDropdownOpen(false), 150)}
                      />
                    )}
                    {parentDropdownOpen && parentSearchResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
                        {parentSearchResults.map((a) => (
                          <li
                            key={a.id}
                            onMouseDown={() => { setEditParentId(a.id); setParentSearch(a.name); setParentDropdownOpen(false) }}
                            className="px-3 py-2 text-sm text-slate-950 dark:text-white hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer"
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
                      className="px-3 py-1 text-xs rounded bg-primary hover:bg-primary-hover text-white disabled:opacity-50 transition-colors"
                    >
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={savingEdit}
                      className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800">
                <div>
                  <span className="text-sm text-slate-950 dark:text-white">{m.name}</span>
                  {m.parentId && (
                    <span className="ml-2 text-xs text-slate-500 dark:text-gray-400">
                      variation of {allMovements.find((a) => a.id === m.parentId)?.name ?? 'unknown'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditing(m)}
                    disabled={reviewingId === m.id}
                    className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
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
                    className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
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
  )
}
