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
        // check-sso creates a hidden iframe to Keycloak's auth endpoint.
        // Keycloak's own JS in that iframe tries its own cross-origin iframe
        // check, which times out (Chrome blocks it), blocking the redirect to
        // silent-check-sso.html. Without onLoad, keycloak-js still handles the
        // post-login ?code= exchange and restores sessions from sessionStorage.
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
