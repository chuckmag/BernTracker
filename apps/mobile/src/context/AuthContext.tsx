import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  api,
  type AuthUser,
  setAccessToken,
  setUnauthorizedHandler,
  storeTokens,
  getStoredTokens,
  clearTokens,
} from '../lib/api'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const didInit = useRef(false)

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearTokens()
      setAccessToken(null)
      setUser(null)
    })
  }, [])

  // Restore session from secure store on app start
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    ;(async () => {
      try {
        const { accessToken, refreshToken } = await getStoredTokens()
        if (!accessToken || !refreshToken) return

        setAccessToken(accessToken)
        const me = await api.auth.me().catch(async () => {
          // accessToken expired — try refresh
          const refreshRes = await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          })
          if (!refreshRes.ok) return null
          const data = await refreshRes.json()
          setAccessToken(data.accessToken)
          await storeTokens(data.accessToken, refreshToken)
          return api.auth.me()
        })
        if (me) setUser(me)
      } catch {
        // Not logged in — stay on login screen
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function login(email: string, password: string) {
    const { accessToken, refreshToken, user: u } = await api.auth.login(email, password)
    await storeTokens(accessToken, refreshToken)
    setAccessToken(accessToken)
    setUser(u)
  }

  async function logout() {
    await clearTokens()
    setAccessToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
