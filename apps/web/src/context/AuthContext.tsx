import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { setUnauthorizedHandler, setAccessToken as setApiToken } from '../lib/api'

const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export type IdentifiedGender = 'FEMALE' | 'MALE' | 'NON_BINARY' | 'PREFER_NOT_TO_SAY' | null

interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  identifiedGender: IdentifiedGender
}

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

    fetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json()
          setAccessToken(data.accessToken)
          setApiToken(data.accessToken)
          const me = await fetch(`${BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${data.accessToken}` },
            credentials: 'include',
          })
          if (me.ok) setUser(await me.json())
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  function login(token: string, u: AuthUser) {
    setAccessToken(token)
    setApiToken(token)
    setUser(u)
  }

  async function logout() {
    await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
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
