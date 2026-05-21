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
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>
  logout: () => Promise<void>
  // Re-fetches `/api/auth/me` and updates the cached user. Callers invoke this
  // after a mutation that the server consumes to derive AuthUser state — most
  // importantly the OnboardingScreen, which needs `user.onboardedAt` to flip
  // from null to a timestamp so the RootNavigator routes to MainTabs.
  refreshUser: () => Promise<void>
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

  // Restore session from secure store on app start.
  // Token refresh on 401 is handled inside request() in api.ts via the
  // Keycloak token endpoint — no manual refresh loop needed here.
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    ;(async () => {
      try {
        const { accessToken } = await getStoredTokens()
        if (!accessToken) return

        setAccessToken(accessToken)
        const me = await api.auth.me().catch(() => null)
        if (me) setUser(me)
      } catch {
        // Not logged in — stay on login screen
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  async function loginWithTokens(accessToken: string, refreshToken: string) {
    await storeTokens(accessToken, refreshToken)
    setAccessToken(accessToken)
    const u = await api.auth.me()
    setUser(u)
  }

  async function logout() {
    await clearTokens()
    setAccessToken(null)
    setUser(null)
  }

  async function refreshUser() {
    const u = await api.auth.me().catch(() => null)
    if (u) setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, loginWithTokens, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
