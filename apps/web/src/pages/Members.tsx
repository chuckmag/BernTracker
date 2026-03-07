import { useEffect, useState } from 'react'
import { api, type Member, type GymProgram, type Role } from '../lib/api'

const ROLES: Role[] = ['MEMBER', 'COACH', 'PROGRAMMER', 'OWNER']
const ROLE_LABELS: Record<Role, string> = {
  MEMBER: 'Member',
  COACH: 'Coach',
  PROGRAMMER: 'Programmer',
  OWNER: 'Owner',
}

export default function Members() {
  const [gymId] = useState<string | null>(() => localStorage.getItem('gymId'))
  const [members, setMembers] = useState<Member[]>([])
  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!gymId) return
    loadData()
  }, [gymId])

  async function loadData() {
    if (!gymId) return
    setLoading(true)
    setError(null)
    try {
      const [m, p] = await Promise.all([api.gyms.members.list(gymId), api.gyms.programs.list(gymId)])
      setMembers(m)
      setPrograms(p)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
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

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!gymId) return
    setInviting(true)
    setError(null)
    try {
      await api.gyms.members.invite(gymId, { email: inviteEmail, role: inviteRole })
      setInviteEmail('')
      setInviteRole('MEMBER')
      setShowInviteModal(false)
      await loadData()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInviting(false)
    }
  }

  async function handleSubscribe(userId: string, programId: string) {
    try {
      await api.programs.subscribe(programId, userId)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Members</h1>
        <p className="text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Members</h1>
          <span className="bg-gray-700 text-sm px-2 py-0.5 rounded-full">{members.length}</span>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
        >
          Invite Member
        </button>
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      {loading && <p className="text-gray-400">Loading…</p>}

      {!loading && members.length === 0 && (
        <p className="text-gray-500 text-sm">No members yet. Invite someone to get started.</p>
      )}

      {members.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-2 pr-4">Name</th>
              <th className="text-left py-2 pr-4">Email</th>
              <th className="text-left py-2 pr-4">Role</th>
              <th className="text-left py-2 pr-4">Joined</th>
              {programs.length > 0 && <th className="text-left py-2 pr-4">Subscribe</th>}
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
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) handleSubscribe(member.id, e.target.value)
                        e.target.value = ''
                      }}
                    >
                      <option value="" disabled>Add to program…</option>
                      {programs.map(({ program }) => (
                        <option key={program.id} value={program.id}>{program.name}</option>
                      ))}
                    </select>
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

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Invite Member</h2>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded text-white text-sm"
                >
                  {inviting ? 'Inviting…' : 'Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
