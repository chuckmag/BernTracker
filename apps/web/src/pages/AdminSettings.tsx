import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type LibraryMovement,
  type MovementCategory,
  type MovementPrType,
  type PendingMovement,
  type Program,
} from '../lib/api'
import { adminProgramScope } from '../lib/adminProgramScope'
import { useMovements } from '../context/MovementsContext.tsx'
import Skeleton from '../components/ui/Skeleton'
import EmptyState from '../components/ui/EmptyState'
import ProgramList from '../components/ProgramList'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<MovementCategory, string> = {
  STRENGTH: 'Strength',
  MONOSTRUCTURAL: 'Monostructural',
  GYMNASTICS: 'Gymnastics',
  SKILL: 'Skill',
  ENDURANCE: 'Endurance',
  MACHINE: 'Machine',
}

const PR_TYPE_LABELS: Record<MovementPrType, string> = {
  LOAD: 'Load',
  MAX_REPS: 'Max Reps',
  TIME: 'Time',
  DISTANCE: 'Distance',
  CALORIES: 'Calories',
  NONE: 'None',
}

const DEFAULT_PR_TYPES: Record<MovementCategory, MovementPrType[]> = {
  STRENGTH: ['LOAD'],
  MONOSTRUCTURAL: ['TIME', 'DISTANCE'],
  GYMNASTICS: ['MAX_REPS'],
  SKILL: ['MAX_REPS'],
  ENDURANCE: ['TIME', 'DISTANCE'],
  MACHINE: ['CALORIES', 'TIME'],
}

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as MovementCategory[]
const ALL_PR_TYPES = Object.keys(PR_TYPE_LABELS) as MovementPrType[]

// ─── PrTypesEditor ────────────────────────────────────────────────────────────

function PrTypesEditor({ value, onChange }: { value: MovementPrType[]; onChange: (v: MovementPrType[]) => void }) {
  const available = ALL_PR_TYPES.filter(t => !value.includes(t))

  function moveUp(i: number) {
    const next = [...value]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }

  return (
    <div className="space-y-1">
      {value.map((pt, i) => (
        <div key={pt} className="flex items-center gap-1.5">
          <span
            className={`text-[10px] w-12 shrink-0 font-medium ${
              i === 0 ? 'text-primary' : 'text-slate-400 dark:text-gray-500'
            }`}
          >
            {i === 0 ? 'primary' : ''}
          </span>
          <span className="text-xs text-slate-950 dark:text-white flex-1">{PR_TYPE_LABELS[pt]}</span>
          {i > 0 && (
            <button
              type="button"
              onClick={() => moveUp(i)}
              title={`Make ${PR_TYPE_LABELS[pt]} primary`}
              className="w-5 h-5 flex items-center justify-center text-xs text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 focus-visible:outline-none"
            >
              ↑
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(value.filter(t => t !== pt))}
            disabled={value.length === 1}
            title={`Remove ${PR_TYPE_LABELS[pt]}`}
            className="w-5 h-5 flex items-center justify-center text-xs text-slate-400 dark:text-gray-500 hover:text-rose-500 dark:hover:text-rose-400 disabled:opacity-30 focus-visible:outline-none"
          >
            ×
          </button>
        </div>
      ))}
      {available.length > 0 && (
        <select
          className="mt-1 text-xs bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-0.5 text-slate-700 dark:text-gray-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          value=""
          aria-label="Add PR type"
          onChange={e => {
            if (e.target.value) onChange([...value, e.target.value as MovementPrType])
          }}
        >
          <option value="">+ Add…</option>
          {available.map(pt => (
            <option key={pt} value={pt}>
              {PR_TYPE_LABELS[pt]}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

// ─── Tab shell ────────────────────────────────────────────────────────────────

type Tab = 'programs' | 'movements'

function readTabFromHash(): Tab {
  if (typeof window === 'undefined') return 'programs'
  return window.location.hash === '#movements' ? 'movements' : 'programs'
}

export default function AdminSettings() {
  const [tab, setTab] = useState<Tab>(readTabFromHash)

  useEffect(() => {
    function onHashChange() {
      setTab(readTabFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(next: Tab) {
    setTab(next)
    const hash = next === 'movements' ? '#movements' : ''
    if (hash !== window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${hash}`)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'programs', label: 'Programs' },
    { id: 'movements', label: 'Movements' },
  ]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">WODalytics Settings</h1>

      <div className="border-b border-slate-200 dark:border-gray-800">
        <nav className="flex gap-1" role="tablist">
          {tabs.map(t => (
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
    return () => {
      signal.cancelled = true
    }
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
      items={programs.map(p => ({ program: p }))}
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
  // Pending section: uses the existing /movements/pending endpoint — works with current + new API.
  const [pendingMovements, setPendingMovements] = useState<PendingMovement[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)

  // Library section: uses /movements?view=library — requires the new API (PR #411).
  // Fails gracefully if the endpoint doesn't exist yet.
  const [library, setLibrary] = useState<LibraryMovement[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)

  useEffect(() => {
    api.movements
      .pending()
      .then(setPendingMovements)
      .catch(() => {})
      .finally(() => setPendingLoading(false))

    api.movements
      .library()
      .then(setLibrary)
      .catch(() => {})
      .finally(() => setLibraryLoading(false))
  }, [])

  function handlePendingApproved(id: string) {
    setPendingMovements(prev => prev.filter(m => m.id !== id))
    setLibrary(prev => prev.map(m => (m.id === id ? { ...m, status: 'ACTIVE' } : m)))
  }

  function handlePendingRejected(id: string) {
    setPendingMovements(prev => prev.filter(m => m.id !== id))
    setLibrary(prev => prev.filter(m => m.id !== id))
  }

  function handlePendingUpdated(id: string, name: string, parentId: string | null) {
    setPendingMovements(prev => prev.map(m => (m.id === id ? { ...m, name, parentId } : m)))
    setLibrary(prev => prev.map(m => (m.id === id ? { ...m, name, parentId } : m)))
  }

  function handleLibraryUpdated(updated: LibraryMovement) {
    setLibrary(prev => prev.map(m => (m.id === updated.id ? updated : m)))
  }

  return (
    <div className="space-y-10">
      <PendingMovementsSection
        pendingMovements={pendingMovements}
        loading={pendingLoading}
        onApproved={handlePendingApproved}
        onRejected={handlePendingRejected}
        onUpdated={handlePendingUpdated}
      />
      <MovementLibrarySection
        library={library}
        loading={libraryLoading}
        onUpdated={handleLibraryUpdated}
      />
    </div>
  )
}

// ─── Pending Movements section ────────────────────────────────────────────────

interface PendingMovementsSectionProps {
  pendingMovements: PendingMovement[]
  loading: boolean
  onApproved: (id: string) => void
  onRejected: (id: string) => void
  onUpdated: (id: string, name: string, parentId: string | null) => void
}

function PendingMovementsSection({
  pendingMovements,
  loading,
  onApproved,
  onRejected,
  onUpdated,
}: PendingMovementsSectionProps) {
  const allMovements = useMovements()

  // Edit state (name + parentId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mvEditName, setMvEditName] = useState('')
  const [editParentId, setEditParentId] = useState<string | null>(null)
  const [parentSearch, setParentSearch] = useState('')
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Approve form state
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveCategory, setApproveCategory] = useState<MovementCategory>('STRENGTH')
  const [approvePrTypes, setApprovePrTypes] = useState<MovementPrType[]>(['LOAD'])
  const [savingApprove, setSavingApprove] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  function startEditing(m: PendingMovement) {
    setEditingId(m.id)
    setMvEditName(m.name)
    setEditParentId(m.parentId)
    setParentSearch(m.parentId ? (allMovements.find(a => a.id === m.parentId)?.name ?? '') : '')
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
      onUpdated(updated.id, updated.name, updated.parentId)
      cancelEditing()
    } catch {
      // leave form open so user can retry
    } finally {
      setSavingEdit(false)
    }
  }

  function startApproving(m: PendingMovement) {
    setApprovingId(m.id)
    setApproveCategory('STRENGTH')
    setApprovePrTypes(DEFAULT_PR_TYPES['STRENGTH'])
  }

  function cancelApproving() {
    setApprovingId(null)
  }

  async function handleConfirmApprove(id: string) {
    setSavingApprove(true)
    try {
      await api.movements.review(id, {
        status: 'ACTIVE',
        category: approveCategory,
        prTypes: approvePrTypes,
      })
      onApproved(id)
      setApprovingId(null)
    } catch {
      // leave form open
    } finally {
      setSavingApprove(false)
    }
  }

  async function handleReject(id: string) {
    setReviewingId(id)
    try {
      await api.movements.review(id, { status: 'REJECTED' })
      onRejected(id)
    } catch {
      // leave in list
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <section>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Pending Movements</h2>
          {pendingMovements.length > 0 && (
            <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 text-sm px-2 py-0.5 rounded-full">
              {pendingMovements.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          Member-suggested movements awaiting review. Approve to add to the library, or reject to discard.
        </p>
      </div>

      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && pendingMovements.length === 0 && (
        <EmptyState
          title="No pending movements"
          body="Member-suggested movements that need review will appear here."
        />
      )}

      {!loading && pendingMovements.length > 0 && (
        <div className="space-y-2">
          {pendingMovements.map(m => {
            const isEditing = editingId === m.id
            const isApproving = approvingId === m.id
            const busy = reviewingId === m.id || savingApprove

            const parentSearchResults = parentSearch.trim()
              ? allMovements
                  .filter(
                    a => a.name.toLowerCase().includes(parentSearch.toLowerCase()) && a.id !== m.id,
                  )
                  .slice(0, 8)
              : []
            const selectedParentName = editParentId
              ? allMovements.find(a => a.id === editParentId)?.name
              : null

            if (isEditing) {
              return (
                <div
                  key={m.id}
                  data-testid="pending-movement-editing-row"
                  className="px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 space-y-3"
                >
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">Name</label>
                    <input
                      className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      value={mvEditName}
                      onChange={e => setMvEditName(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-xs text-slate-600 dark:text-gray-400 mb-1">
                      Parent movement (optional)
                    </label>
                    {selectedParentName ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/30 text-primary text-xs">
                          {selectedParentName}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditParentId(null)
                            setParentSearch('')
                          }}
                          className="text-xs text-slate-400 dark:text-gray-400 hover:text-slate-950 dark:hover:text-gray-200"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        placeholder="Search movements…"
                        value={parentSearch}
                        onChange={e => {
                          setParentSearch(e.target.value)
                          setParentDropdownOpen(true)
                        }}
                        onFocus={() => setParentDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setParentDropdownOpen(false), 150)}
                      />
                    )}
                    {parentDropdownOpen && parentSearchResults.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
                        {parentSearchResults.map(a => (
                          <li
                            key={a.id}
                            onMouseDown={() => {
                              setEditParentId(a.id)
                              setParentSearch(a.name)
                              setParentDropdownOpen(false)
                            }}
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

            if (isApproving) {
              return (
                <div
                  key={m.id}
                  data-testid="pending-movement-approve-row"
                  className="px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-900/50 space-y-3"
                >
                  <div className="font-medium text-sm text-slate-950 dark:text-white">{m.name}</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        className="block text-xs text-slate-600 dark:text-gray-400 mb-1"
                        htmlFor={`approve-cat-${m.id}`}
                      >
                        Category
                      </label>
                      <select
                        id={`approve-cat-${m.id}`}
                        className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        value={approveCategory}
                        onChange={e => {
                          const cat = e.target.value as MovementCategory
                          setApproveCategory(cat)
                          setApprovePrTypes(DEFAULT_PR_TYPES[cat] ?? ['LOAD'])
                        }}
                      >
                        {ALL_CATEGORIES.map(c => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="block text-xs text-slate-600 dark:text-gray-400 mb-1">PR Types</span>
                      <PrTypesEditor value={approvePrTypes} onChange={setApprovePrTypes} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleConfirmApprove(m.id)}
                      disabled={savingApprove}
                      className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
                    >
                      {savingApprove ? 'Approving…' : 'Confirm Approve'}
                    </button>
                    <button
                      onClick={cancelApproving}
                      disabled={savingApprove}
                      className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={m.id}
                data-testid="pending-movement-row"
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800"
              >
                <div>
                  <span className="text-sm text-slate-950 dark:text-white">{m.name}</span>
                  {m.parentId && (
                    <span className="ml-2 text-xs text-slate-500 dark:text-gray-400">
                      variation of{' '}
                      {allMovements.find(a => a.id === m.parentId)?.name ?? 'unknown'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditing(m)}
                    disabled={busy}
                    className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => startApproving(m)}
                    disabled={busy}
                    className="px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(m.id)}
                    disabled={busy}
                    className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                  >
                    {reviewingId === m.id ? 'Rejecting…' : 'Reject'}
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

// ─── Movement Library section ─────────────────────────────────────────────────

function MovementLibrarySection({
  library,
  loading,
  onUpdated,
}: {
  library: LibraryMovement[]
  loading: boolean
  onUpdated: (m: LibraryMovement) => void
}) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<MovementCategory | ''>('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState<MovementCategory>('STRENGTH')
  const [editPrTypes, setEditPrTypes] = useState<MovementPrType[]>(['LOAD'])
  const [saving, setSaving] = useState(false)

  const filtered = useMemo(() => {
    return library.filter(m => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
      if (categoryFilter && m.category !== categoryFilter) return false
      return true
    })
  }, [library, search, categoryFilter])

  function startEditing(m: LibraryMovement) {
    setEditingId(m.id)
    setEditCategory(m.category ?? 'STRENGTH')
    setEditPrTypes(m.prTypes?.length ? m.prTypes : ['LOAD'])
  }

  function cancelEditing() {
    setEditingId(null)
  }

  async function handleSave(id: string) {
    setSaving(true)
    try {
      const updated = await api.movements.update(id, { category: editCategory, prTypes: editPrTypes })
      onUpdated(updated)
      setEditingId(null)
    } catch {
      // leave form open
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Movement Library</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">
            All active and pending movements. Set category and PR types for each.
          </p>
        </div>
        {!loading && (
          <span className="text-sm text-slate-500 dark:text-gray-400 mt-1">{library.length} movements</span>
        )}
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          className="flex-1 min-w-48 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          placeholder="Search movements…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-slate-950 dark:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          value={categoryFilter}
          aria-label="Filter by category"
          onChange={e => setCategoryFilter(e.target.value as MovementCategory | '')}
        >
          <option value="">All categories</option>
          {ALL_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      {loading && <Skeleton variant="feed-row" count={4} />}

      {!loading && filtered.length === 0 && (
        <EmptyState title="No movements found" body="Try adjusting the search or category filter." />
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400">
                  Category
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400">
                  PR Types
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-gray-400">
                  Vars
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-gray-800">
              {filtered.map(m => {
                if (editingId === m.id) {
                  return (
                    <tr key={m.id} className="bg-slate-50 dark:bg-gray-900/50">
                      <td className="px-4 py-3 text-slate-950 dark:text-white" colSpan={4}>
                        <div className="font-medium mb-2">{m.name}</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label
                              className="block text-xs text-slate-600 dark:text-gray-400 mb-1"
                              htmlFor={`lib-cat-${m.id}`}
                            >
                              Category
                            </label>
                            <select
                              id={`lib-cat-${m.id}`}
                              className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-2 py-1 text-sm text-slate-950 dark:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value as MovementCategory)}
                            >
                              {ALL_CATEGORIES.map(c => (
                                <option key={c} value={c}>
                                  {CATEGORY_LABELS[c]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <span className="block text-xs text-slate-600 dark:text-gray-400 mb-1">
                              PR Types
                            </span>
                            <PrTypesEditor value={editPrTypes} onChange={setEditPrTypes} />
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleSave(m.id)}
                            disabled={saving}
                            className="px-3 py-1 text-xs rounded bg-primary hover:bg-primary-hover text-white disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            disabled={saving}
                            className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  )
                }

                return (
                  <tr
                    key={m.id}
                    className="bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-slate-950 dark:text-white">{m.name}</span>
                      {m.parentName && (
                        <span className="ml-1.5 text-xs text-slate-400 dark:text-gray-500">
                          ↳ {m.parentName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          m.status === 'ACTIVE'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {m.status === 'ACTIVE' ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-gray-300">
                      {m.category ? CATEGORY_LABELS[m.category] : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-gray-300 text-xs">
                      {(m.prTypes ?? []).map((pt, i) => (
                        <span key={pt}>
                          {i > 0 && (
                            <span className="text-slate-300 dark:text-gray-600 mx-1" aria-hidden="true">
                              ·
                            </span>
                          )}
                          <span className={i === 0 ? 'text-slate-950 dark:text-white' : ''}>
                            {PR_TYPE_LABELS[pt]}
                          </span>
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-gray-400 text-xs">
                      {(m.variationCount ?? 0) > 0 ? m.variationCount : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => startEditing(m)}
                        className="px-3 py-1 text-xs rounded bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
