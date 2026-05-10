import { createContext, useContext, useEffect, useRef, useState } from 'react'
import keycloak from '../lib/keycloak'
import { api, type AuthUser } from '../lib/api'

export type { IdentifiedGender } from '../lib/api'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: () => void
  loginWithGoogle: () => void
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const didInit = useRef(false)

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    keycloak
      .init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        pkceMethod: 'S256',
        // The login iframe check uses third-party cookies to detect session
        // expiry. Chrome blocks cross-origin postMessage between different
        // localhost ports, causing timeouts. Disable it — token expiry is
        // caught by updateToken() in apiFetch instead.
        checkLoginIframe: false,
      })
      .then(async (authenticated) => {
        if (authenticated) {
          try {
            const me = await api.auth.me()
            setUser(me)
          } catch {
            // me failed — treat as unauthenticated
          }
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  function login() {
    keycloak.login()
  }

  function loginWithGoogle() {
    keycloak.login({ idpHint: 'google' })
  }

  async function logout() {
    localStorage.removeItem('gymId')
    await keycloak.logout({ redirectUri: window.location.origin + '/login' })
  }

  async function refreshUser() {
    try {
      const me = await api.auth.me()
      setUser(me)
    } catch {
      // best-effort
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
