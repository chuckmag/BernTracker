import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { api, setUnauthorizedHandler, setAccessToken as setApiToken, type AuthUser } from '../lib/api'

export type { IdentifiedGender } from '../lib/api'

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const didFetch = useRef(false)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setApiToken(null)
      setAccessToken(null)
      setUser(null)
      window.location.replace('/login')
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    api.auth.refresh()
      .then(async (refreshed) => {
        if (!refreshed) return
        setAccessToken(refreshed.accessToken)
        setApiToken(refreshed.accessToken)
        try {
          const me = await api.auth.me(refreshed.accessToken)
          setUser(me)
        } catch {
          // me failed — treat as unauthenticated; unauthorized handler will redirect if needed
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  function login(token: string, u: AuthUser) {
    setAccessToken(token)
    setApiToken(token)
    setUser(u)
  }

  async function logout() {
    await api.auth.logout().catch(() => {})
    setAccessToken(null)
    setApiToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
