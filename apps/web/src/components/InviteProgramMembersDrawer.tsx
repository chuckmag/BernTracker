import { useEffect, useMemo, useState } from 'react'
import { api, type Member, type ProgramMember } from '../lib/api'
import Button from './ui/Button'

interface InviteProgramMembersDrawerProps {
  open: boolean
  gymId: string
  programId: string
  /** Existing program members — excluded from the picker so we don't surface dupes. */
  existingMemberIds: Set<string>
  onClose: () => void
  /** Fires after a batch invite settles, with counts so the caller can toast. */
  onInvited: (added: number, errors: { email: string; reason: string }[]) => void
}

export default function InviteProgramMembersDrawer({
  open,
  gymId,
  programId,
  existingMemberIds,
  onClose,
  onInvited,
}: InviteProgramMembersDrawerProps) {
  const [gymMembers, setGymMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loadingList, setLoadingList] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setPicked(new Set())
    setError(null)
    let cancelled = false
    setLoadingList(true)
    api.gyms.members.list(gymId)
      .then((list) => { if (!cancelled) setGymMembers(list) })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoadingList(false) })
    return () => { cancelled = true }
  }, [open, gymId])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return gymMembers
      .filter((m) => !existingMemberIds.has(m.id))
      .filter((m) => {
        if (!q) return true
        const name = (m.name ?? '').toLowerCase()
        return name.includes(q) || m.email.toLowerCase().includes(q)
      })
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
  }, [gymMembers, existingMemberIds, search])

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (picked.size === 0) return
    setSubmitting(true)
    setError(null)
    const targets = Array.from(picked)
    const results = await Promise.all(
      targets.map(async (userId) => {
        const member = gymMembers.find((m) => m.id === userId)
        try {
          await api.programs.members.invite(programId, { userId })
          return { ok: true as const, member: member as ProgramMember | undefined }
        } catch (e) {
          return { ok: false as const, email: member?.email ?? userId, reason: (e as Error).message }
        }
      }),
    )
    const added = results.filter((r) => r.ok).length
    const errors = results.flatMap((r) => r.ok ? [] : [{ email: r.email, reason: r.reason }])
    setSubmitting(false)
    onInvited(added, errors)
  }

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-30" onClick={onClose} />}

      <div
        className={[
          'fixed top-0 right-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-slate-200 dark:border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">Invite members</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-slate-400 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors text-xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-gray-800">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gym members…"
            className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded px-3 py-2 text-sm text-slate-950 dark:text-white placeholder-slate-400 dark:placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            aria-label="Search gym members"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && <p className="text-red-400 text-sm px-5 py-3">{error}</p>}
          {loadingList && <p className="text-slate-400 dark:text-gray-400 text-sm px-5 py-3">Loading members…</p>}
          {!loadingList && candidates.length === 0 && (
            <p className="text-slate-400 dark:text-gray-400 text-sm px-5 py-3">
              {gymMembers.length === existingMemberIds.size
                ? 'All gym members are already in this program.'
                : 'No matches.'}
            </p>
          )}
          {candidates.map((m) => {
            const checked = picked.has(m.id)
            return (
              <label
                key={m.id}
                className="flex items-center gap-3 px-5 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400 dark:border-gray-600 bg-white dark:bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                  checked={checked}
                  onChange={() => togglePick(m.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-950 dark:text-white">
                    {m.name ?? <span className="italic text-slate-400 dark:text-gray-400">Pending</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-gray-400">{m.email}</span>
                </span>
              </label>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-800 flex items-center gap-2">
          <Button variant="primary" onClick={handleSubmit} disabled={submitting || picked.size === 0} className="flex-1">
            {submitting ? 'Inviting…' : `Invite ${picked.size || ''} member${picked.size === 1 ? '' : 's'}`.trim()}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  )
}
