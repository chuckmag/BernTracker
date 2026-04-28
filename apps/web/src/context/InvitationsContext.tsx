import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, type GymInvitation } from '../lib/api'
import { useAuth } from './AuthContext.tsx'

interface InvitationsState {
  invitations: GymInvitation[]
  loading: boolean
  refresh: () => Promise<void>
  accept: (id: string) => Promise<void>
  decline: (id: string) => Promise<void>
}

const InvitationsContext = createContext<InvitationsState | null>(null)

export function InvitationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [invitations, setInvitations] = useState<GymInvitation[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setInvitations([])
      return
    }
    setLoading(true)
    try {
      const list = await api.users.me.invitations.list()
      setInvitations(list)
    } catch {
      // Silent — banner just won't show. The Profile page surfaces a real error.
    } finally {
      setLoading(false)
    }
  }, [user])

  // Fetch on mount and any time the signed-in user changes (login/logout).
  useEffect(() => {
    refresh()
  }, [refresh])

  const accept = useCallback(async (id: string) => {
    await api.users.me.invitations.accept(id)
    await refresh()
  }, [refresh])

  const decline = useCallback(async (id: string) => {
    await api.users.me.invitations.decline(id)
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
