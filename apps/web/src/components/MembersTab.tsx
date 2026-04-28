import { useEffect, useState } from 'react'
import { api, type Member, type GymProgram, type Role } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import GymInvitationsPanel from './GymInvitationsPanel'

const ROLES: Role[] = ['MEMBER', 'COACH', 'PROGRAMMER', 'OWNER']
const ROLE_LABELS: Record<Role, string> = {
  MEMBER: 'Member',
  COACH: 'Coach',
  PROGRAMMER: 'Programmer',
  OWNER: 'Owner',
}

// Members tab on /gym-settings (#members). Replaces the old standalone /members
// route — gym staff manage current members and invitations from one place.
// Invite-by-email lives in the GymInvitationsPanel below the table; pending
// invitations land there until the invitee accepts.
export default function MembersTab() {
  const { gymId } = useGym()
  const [members, setMembers] = useState<Member[]>([])
  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gymId) return
    const signal = { cancelled: false }
    loadData(signal)
    return () => { signal.cancelled = true }
  }, [gymId])

  async function loadData(signal?: { cancelled: boolean }) {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const [m, p] = await Promise.all([api.gyms.members.list(gymId), api.gyms.programs.list(gymId)])
      if (!signal?.cancelled) { setMembers(m); setPrograms(p) }
    } catch (e) {
      if (!signal?.cancelled) setError((e as Error).message)
    } finally {
      if (!signal?.cancelled) setLoading(false)
    }
  }

  async function handleRoleChange(userId: string, role: Role) {
    if (!gymId) return
    try {
      await api.gyms.members.updateRole(gymId, userId, role)
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleRemove(userId: string) {
    if (!gymId) return
    if (!window.confirm('Remove this member from the gym?')) return
    try {
      await api.gyms.members.remove(gymId, userId)
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleSubscribe(userId: string, programId: string) {
    try {
      await api.programs.members.invite(programId, { userId })
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleUnsubscribe(userId: string, programId: string) {
    try {
      await api.programs.members.remove(programId, userId)
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!gymId) return null

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Members</h2>
          <span className="bg-gray-700 text-sm px-2 py-0.5 rounded-full" aria-label={`${members.length} members`}>
            {members.length}
          </span>
        </div>

        {error && <p className="text-red-400 mb-4">{error}</p>}
        {loading && <p className="text-gray-400">Loading…</p>}

        {!loading && members.length === 0 && (
          <p className="text-gray-500 text-sm">No members yet. Send an invitation below to get started.</p>
        )}

        {members.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 pr-4">Name</th>
                <th className="text-left py-2 pr-4">Email</th>
                <th className="text-left py-2 pr-4">Role</th>
                <th className="text-left py-2 pr-4">Joined</th>
                {programs.length > 0 && <th className="text-left py-2 pr-4">Programs</th>}
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-b border-gray-800">
                  <td className="py-2 pr-4">{member.name ?? <span className="text-gray-500 italic">Pending</span>}</td>
                  <td className="py-2 pr-4 text-gray-400">{member.email}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                      aria-label={`Role for ${member.email}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </td>
                  {programs.length > 0 && (
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap items-center gap-1">
                        {member.programs.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center gap-1 bg-indigo-900/60 text-indigo-300 text-xs px-2 py-0.5 rounded-full"
                          >
                            {p.name}
                            <button
                              type="button"
                              onClick={() => handleUnsubscribe(member.id, p.id)}
                              className="text-indigo-400 hover:text-red-400 leading-none"
                              aria-label={`Remove from ${p.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {programs.some(({ program }) => !member.programs.find((p) => p.id === program.id)) && (
                          <select
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-400 text-xs"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) handleSubscribe(member.id, e.target.value)
                            }}
                            aria-label={`Add program for ${member.email}`}
                          >
                            <option value="" disabled>+ Add…</option>
                            {programs
                              .filter(({ program }) => !member.programs.find((p) => p.id === program.id))
                              .map(({ program }) => (
                                <option key={program.id} value={program.id}>{program.name}</option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="py-2">
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <GymInvitationsPanel />
    </div>
  )
}
