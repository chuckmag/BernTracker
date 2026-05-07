import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type Movement } from '../lib/api'

interface MovementsContextValue {
  movements: Movement[]
}

const MovementsContext = createContext<MovementsContextValue | null>(null)

/**
 * Loads the active-movements catalog once and exposes it via `useMovements()`.
 * Mirrors the web provider (apps/web/src/context/MovementsContext.tsx) so the
 * editor + future surfaces (movement-history filters, suggestion pills) read
 * from the same shape on both clients.
 *
 * Failure is silent — a missing catalog leaves `useMovements()` returning an
 * empty array. Consumers that need the catalog (e.g., movement detect on the
 * editor) treat the empty case as "skip detection." Same convention as web.
 */
export function MovementsProvider({ children }: { children: ReactNode }) {
  const [movements, setMovements] = useState<Movement[]>([])
  const didFetch = useRef(false)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true
    api.movements.list().then(setMovements).catch(() => {})
  }, [])

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
