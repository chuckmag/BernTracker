import { useEffect, useState } from 'react'
import { api, type ProgramMember } from '../lib/api'
import Button from './ui/Button'
import Skeleton from './ui/Skeleton'
import EmptyState from './ui/EmptyState'
import InviteProgramMembersDrawer from './InviteProgramMembersDrawer'

interface ProgramMembersTabProps {
  programId: string
  gymId: string
  /** OWNER and PROGRAMMER can invite + remove. COACH gets read-only. */
  canManage: boolean
  /** Fires after a successful invite/remove so the parent can refresh stats. */
  onMembershipChanged?: () => void
}

export default function ProgramMembersTab({
  programId,
  gymId,
  canManage,
  onMembershipChanged,
}: ProgramMembersTabProps) {
  const [members, setMembers] = useState<ProgramMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    load(cancelled)
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId])

  async function load(cancelledRef?: boolean) {
    setLoading(true)
    setError(null)
    try {
      const list = await api.programs.members.list(programId)
      if (cancelledRef !== true) setMembers(list)
    } catch (e) {
      if (cancelledRef !== true) setError((e as Error).message)
    } finally {
      if (cancelledRef !== true) setLoading(false)
    }
  }

  async function handleRemove(member: ProgramMember) {
    if (!window.confirm(`Remove ${member.name ?? member.email} from this program?`)) return
    setError(null)
    try {
      await api.programs.members.remove(programId, member.id)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      onMembershipChanged?.()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function handleInvited(added: number, errors: { email: string; reason: string }[]) {
    setDrawerOpen(false)
    if (added > 0) {
      setInfo(`Invited ${added} member${added === 1 ? '' : 's'}.`)
      onMembershipChanged?.()
      load()
    }
    if (errors.length > 0) {
      const lines = errors.map((e) => `${e.email}: ${e.reason}`)
      setError(lines.join('\n'))
    } else if (added > 0) {
      setError(null)
    }
  }

  const existingIds = new Set(members.map((m) => m.id))

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <Button variant="primary" onClick={() => setDrawerOpen(true)}>
            Invite members
          </Button>
        </div>
      )}

      {error && <p className="text-red-400 text-sm whitespace-pre-line mb-3">{error}</p>}
      {info && !error && <p className="text-emerald-400 text-sm mb-3">{info}</p>}

      {loading && <Skeleton variant="history-row" count={3} />}

      {!loading && members.length === 0 && (
        <EmptyState
          title="No members yet"
          body={canManage ? 'Invite gym members to give them access to this program.' : 'Members will appear here once the program is staffed.'}
          cta={canManage ? { label: 'Invite members', onClick: () => setDrawerOpen(true) } : undefined}
        />
      )}

      {members.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-700 dark:text-gray-400 border-b border-slate-200 dark:border-gray-800">
              <th className="text-left py-2 pr-4 font-medium">Name</th>
              <th className="text-left py-2 pr-4 font-medium">Email</th>
              <th className="text-left py-2 pr-4 font-medium">Program role</th>
              <th className="text-left py-2 pr-4 font-medium">Joined</th>
              {canManage && <th className="py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-200 dark:border-gray-800">
                <td className="py-2 pr-4 text-slate-950 dark:text-white">
                  {m.name ?? <span className="italic text-slate-400 dark:text-gray-400">Pending</span>}
                </td>
                <td className="py-2 pr-4 text-slate-500 dark:text-gray-400">{m.email}</td>
                <td className="py-2 pr-4 text-slate-500 dark:text-gray-400 capitalize">{m.role.toLowerCase()}</td>
                <td className="py-2 pr-4 text-slate-500 dark:text-gray-400">
                  {new Date(m.joinedAt).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      className="text-rose-400 hover:text-rose-300 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 rounded px-1"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <InviteProgramMembersDrawer
          open={drawerOpen}
          gymId={gymId}
          programId={programId}
          existingMemberIds={existingIds}
          onClose={() => setDrawerOpen(false)}
          onInvited={handleInvited}
        />
      )}
    </div>
  )
}
