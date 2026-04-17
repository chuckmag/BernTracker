import { createContext, useContext, useEffect, useState } from 'react'
import { api, type MyGym, type Role } from '../lib/api'

interface GymContextValue {
  gyms: MyGym[]
  gymId: string | null
  gymRole: Role | null
  setGymId: (id: string) => void
  loading: boolean
}

const GymContext = createContext<GymContextValue | null>(null)

export function GymProvider({ children }: { children: React.ReactNode }) {
  const [gyms, setGyms] = useState<MyGym[]>([])
  const [gymId, setGymIdState] = useState<string | null>(() => localStorage.getItem('gymId'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.me.gyms()
      .then((fetched) => {
        setGyms(fetched)
        // Auto-select the first gym when localStorage has no stored value
        // (e.g. after session clear or first login)
        if (!localStorage.getItem('gymId') && fetched.length > 0) {
          const firstId = fetched[0].id
          localStorage.setItem('gymId', firstId)
          setGymIdState(firstId)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setGymId(id: string) {
    localStorage.setItem('gymId', id)
    setGymIdState(id)
  }

  const gymRole: Role | null = gymId
    ? (gyms.find((g) => g.id === gymId)?.role ?? null)
    : null

  return (
    <GymContext.Provider value={{ gyms, gymId, gymRole, setGymId, loading }}>
      {children}
    </GymContext.Provider>
  )
}

export function useGym() {
  const ctx = useContext(GymContext)
  if (!ctx) throw new Error('useGym must be used inside GymProvider')
  return ctx
}
