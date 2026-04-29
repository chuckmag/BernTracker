import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, type MyGym, type Role } from '../lib/api'

interface GymContextValue {
  gyms: MyGym[]
  gymId: string | null
  gymRole: Role | null
  setGymId: (id: string) => void
  /** Re-fetch /api/me/gyms — used after a gym mutation that changes a row
   *  the picker renders (e.g. logoUrl, name). */
  refreshGyms: () => Promise<void>
  loading: boolean
}

const GymContext = createContext<GymContextValue | null>(null)

export function GymProvider({ children }: { children: React.ReactNode }) {
  const [gyms, setGyms] = useState<MyGym[]>([])
  const [gymId, setGymIdState] = useState<string | null>(() => localStorage.getItem('gymId'))
  const [loading, setLoading] = useState(true)
  const didFetch = useRef(false)

  const refreshGyms = useCallback(async () => {
    try {
      const fetched = await api.me.gyms()
      setGyms(fetched)
      if (!localStorage.getItem('gymId') && fetched.length > 0) {
        const firstId = fetched[0].id
        localStorage.setItem('gymId', firstId)
        setGymIdState(firstId)
      }
    } catch {
      // Best-effort — caller surfaces its own error. Stale data is fine.
    }
  }, [])

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true
    refreshGyms().finally(() => setLoading(false))
  }, [refreshGyms])

  function setGymId(id: string) {
    localStorage.setItem('gymId', id)
    setGymIdState(id)
  }

  const gymRole: Role | null = gymId
    ? (gyms.find((g) => g.id === gymId)?.role ?? null)
    : null

  return (
    <GymContext.Provider value={{ gyms, gymId, gymRole, setGymId, refreshGyms, loading }}>
      {children}
    </GymContext.Provider>
  )
}

export function useGym() {
  const ctx = useContext(GymContext)
  if (!ctx) throw new Error('useGym must be used inside GymProvider')
  return ctx
}
