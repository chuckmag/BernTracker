import { createContext, useContext, useEffect, useState } from 'react'
import { api, type Gym } from '../lib/api'
import { useAuth } from './AuthContext'

interface GymState {
  activeGym: Gym | null
  isLoading: boolean
  selectGym: (gym: Gym) => void
}

const GymContext = createContext<GymState | null>(null)

export function GymProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [activeGym, setActiveGym] = useState<Gym | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      setActiveGym(null)
      return
    }
    setIsLoading(true)
    api.me.gyms()
      .then((gyms) => {
        if (gyms.length === 1) setActiveGym(gyms[0])
        // Multiple gyms: leave null — navigator will show GymPickerScreen
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [user])

  return (
    <GymContext.Provider value={{ activeGym, isLoading, selectGym: setActiveGym }}>
      {children}
    </GymContext.Provider>
  )
}

export function useGym() {
  const ctx = useContext(GymContext)
  if (!ctx) throw new Error('useGym must be used inside GymProvider')
  return ctx
}
