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

    // Proactively refresh the access token every 4 minutes so the Keycloak
    // session stays alive regardless of API call frequency. Without this, a
    // user who leaves the tab open without triggering any requests can hit
    // the SSO session idle timeout and get force-logged-out on their next action.
    let refreshInterval: ReturnType<typeof setInterval> | null = null

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(300).catch(() => keycloak.login())
    }

    keycloak
      .init({
        pkceMethod: 'S256',
        // check-sso creates a hidden iframe to Keycloak's auth endpoint.
        // Keycloak's own JS in that iframe tries its own cross-origin iframe
        // check, which times out (Chrome blocks it), blocking the redirect to
        // silent-check-sso.html. Without onLoad, keycloak-js still handles the
        // post-login ?code= exchange and restores sessions from sessionStorage.
        checkLoginIframe: false,
      })
      .then(async (authenticated) => {
        if (authenticated) {
          refreshInterval = setInterval(
            () => keycloak.updateToken(300).catch(() => keycloak.login()),
            4 * 60 * 1000,
          )
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

    return () => {
      if (refreshInterval) clearInterval(refreshInterval)
    }
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
