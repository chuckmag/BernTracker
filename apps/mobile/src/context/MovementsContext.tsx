import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Movement } from '../lib/api'
import { useAuth } from './AuthContext'

interface MovementsContextValue {
  movements: Movement[]
}

const MovementsContext = createContext<MovementsContextValue | null>(null)

/**
 * Loads the active-movements catalog and exposes it via `useMovements()`.
 *
 * Auth-gated by design: the mobile API client reads its bearer token from
 * a module-level cache populated *after* AuthProvider's async SecureStore
 * read resolves. Firing this fetch before that finishes used to send a
 * tokenless request → 401 → silent .catch → permanently empty catalog
 * because the original `didFetch` ref pinned the no-op result.
 *
 * The fix is to depend on `useAuth().user` so the fetch only runs once
 * we know there's a token in `_accessToken`. Re-running on user change
 * (login → out → in) also keeps the catalog correct across auth state
 * transitions without extra ceremony.
 *
 * Failure is still silent (returns []), so consumers that need the
 * catalog (e.g., manual movement search) handle the empty case
 * gracefully.
 */
export function MovementsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [movements, setMovements] = useState<Movement[]>([])

  useEffect(() => {
    if (!user) {
      // Logged-out tree → drop any cached catalog so a future login
      // doesn't render movements that belong to no current session.
      if (movements.length > 0) setMovements([])
      return
    }
    let cancelled = false
    api.movements.list()
      .then((m) => { if (!cancelled) setMovements(m) })
      .catch(() => {})
    return () => { cancelled = true }
    // movements.length intentionally omitted — including it would
    // create a feedback loop when we clear on logout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  return (
    <MovementsContext.Provider value={{ movements }}>
      {children}
    </MovementsContext.Provider>
  )
}

export function useMovements(): Movement[] {
  const ctx = useContext(MovementsContext)
  if (!ctx) throw new Error('useMovements must be used inside MovementsProvider')
  return ctx.movements
}
