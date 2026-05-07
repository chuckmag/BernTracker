import { createContext, useContext, useEffect, useState } from 'react'
import {
  type ThemeMode,
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredMode,
} from '../lib/useTheme'

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode)

  useEffect(() => {
    // Sync class on mount in case the inline script and React state diverge.
    applyTheme(mode)
  }, [])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  function setMode(next: ThemeMode) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // localStorage unavailable — still update in-memory state
    }
    applyTheme(next)
    setModeState(next)
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
