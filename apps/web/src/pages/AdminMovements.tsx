import { useEffect, useState } from 'react'
import { api, type PendingMovement } from '../lib/api'
import { useMovements } from '../context/MovementsContext.tsx'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'

/**
 * WODalytics admin — pending movement review (#160 follow-up).
 *
 * Mounted at `/admin/movements`. Server gates every endpoint via
 * `requireWodalyticsAdmin`; the sidebar additionally hides the link for
 * non-admins. Lifted out of `/gym-settings` (where it was rendered behind a
 * `user.isWodalyticsAdmin` conditional and didn't actually belong on the
 * gym-settings page).
 *
 * Behavior preserved verbatim from the GymSettings block:
 *   - load all PENDING movements on mount
 *   - inline edit (rename + parent search)
 *   - approve (status=ACTIVE) / reject (status=REJECTED)
 */
export default function AdminMovements() {
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
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Settings · Movements</h1>
          {pendingMovements.length > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 text-sm px-2 py-0.5 rounded-full">
              {pendingMovements.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-400">
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
    </div>
  )
}
