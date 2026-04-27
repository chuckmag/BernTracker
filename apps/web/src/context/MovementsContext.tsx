import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api, type Movement } from '../lib/api'

interface MovementsContextValue {
  movements: Movement[]
}

const MovementsContext = createContext<MovementsContextValue | null>(null)

export function MovementsProvider({ children }: { children: React.ReactNode }) {
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
