import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, type PendingInvitation } from '../lib/api'
import { useAuth } from './AuthContext.tsx'

interface InvitationsState {
  invitations: PendingInvitation[]
  loading: boolean
  refresh: () => Promise<void>
  accept: (item: PendingInvitation) => Promise<void>
  decline: (item: PendingInvitation) => Promise<void>
}

const InvitationsContext = createContext<InvitationsState | null>(null)

export function InvitationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setInvitations([])
      return
    }
    setLoading(true)
    try {
      const list = await api.users.me.invitations.pendingAll()
      setInvitations(list)
    } catch {
      // Silent — banner just won't show. The Profile page surfaces a real error.
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  const accept = useCallback(async (item: PendingInvitation) => {
    if (item.kind === 'membershipRequest') {
      await api.users.me.invitations.accept(item.data.id)
    } else {
      await api.users.me.codeInvitations.accept(item.data.code)
    }
    await refresh()
  }, [refresh])

  const decline = useCallback(async (item: PendingInvitation) => {
    if (item.kind === 'membershipRequest') {
      await api.users.me.invitations.decline(item.data.id)
    } else {
      await api.users.me.codeInvitations.decline(item.data.code)
    }
    await refresh()
  }, [refresh])

  return (
    <InvitationsContext.Provider value={{ invitations, loading, refresh, accept, decline }}>
      {children}
    </InvitationsContext.Provider>
  )
}

export function useInvitations() {
  const ctx = useContext(InvitationsContext)
  if (!ctx) throw new Error('useInvitations must be used inside InvitationsProvider')
  return ctx
}
