import { createContext, useContext, useEffect, useRef, useState } from 'react'
import keycloak from '../lib/keycloak'
import { api, type AuthUser } from '../lib/api'

export type { IdentifiedGender } from '../lib/api'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: () => void
  loginWithGoogle: () => void
  register: () => void
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
        pkceMethod: 'S256',
        // keycloak-js v26 does not persist tokens between page loads — they
        // live in memory only. Without onLoad, every refresh returns
        // authenticated=false and redirects the user to login even though the
        // Keycloak SSO session (7-day idle timeout) is still active.
        // check-sso + silentCheckSsoRedirectUri probes the Keycloak server via
        // a hidden iframe on every page load, silently restoring tokens when
        // the SSO session is alive.
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        // Disables the periodic login-iframe check. Keycloak's session-check
        // iframe triggers a nested cross-origin iframe that Chrome blocks,
        // which would hang and prevent the silent SSO probe from completing.
        // The per-request updateToken(30) in apiFetch keeps the token fresh.
        checkLoginIframe: false,
      })
      .then(async (authenticated) => {
        if (authenticated) {
          try {
            const me = await api.auth.me()
            setUser(me)
          } catch {
            // Token was rejected by the API — clear it so the next login()
            // call starts a fresh auth flow instead of retrying the same token.
            keycloak.clearToken()
          }
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  const postLoginUri = window.location.origin + '/'

  function login() {
    keycloak.login({ redirectUri: postLoginUri })
  }

  function loginWithGoogle() {
    keycloak.login({ idpHint: 'google', redirectUri: postLoginUri })
  }

  function register() {
    keycloak.register({ redirectUri: postLoginUri })
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
    <AuthContext.Provider value={{ user, isLoading, login, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
