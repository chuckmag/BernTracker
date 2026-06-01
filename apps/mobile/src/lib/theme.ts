import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Brand color values — kept in sync with apps/web/src/index.css and designTokens.ts.
const BRAND = {
  primary:      { light: '#1E5AA8', dark: '#5B9BE6' },
  primaryHover: { light: '#1A4D90', dark: '#7AB0EE' },
  accent:       { light: '#2BA8A4', dark: '#5FD4D0' },
  accentHover:  { light: '#238F8B', dark: '#7AE4E0' },
} as const

// Full semantic palette. Add to this as new surfaces/roles are needed.
export const COLORS = {
  light: {
    // Surfaces
    screenBg:   '#f8fafc', // slate-50
    cardBg:     '#ffffff', // white
    inputBg:    '#ffffff',
    surfaceSubtle: '#f1f5f9', // slate-100 — recessed neutral surface (inner cards, quiet buttons, skeletons)
    // Borders
    borderSubtle:      '#e2e8f0', // slate-200
    borderInteractive: '#cbd5e1', // slate-300
    // Text
    textPrimary:   '#020617', // slate-950
    textSecondary: '#334155', // slate-700
    textTertiary:  '#64748b', // slate-500
    textMuted:     '#64748b', // slate-500
    textLabel:     '#475569', // slate-600
    textPlaceholder: '#94a3b8', // slate-400
    // Brand
    primary:      BRAND.primary.light,
    primaryHover: BRAND.primaryHover.light,
    accent:       BRAND.accent.light,
    accentHover:  BRAND.accentHover.light,
    accentText:   '#020617', // slate-950 — accent bg has low contrast with white
    onPrimary:    '#ffffff', // text rendered on top of `primary` — same in both themes (primary bg is dark enough either way)
    onPrimaryTint: 'rgba(255,255,255,0.18)', // translucent overlay on top of `primary` (count badges, pill chrome)
    // Overlays
    modalScrim: 'rgba(0,0,0,0.6)', // backdrop for modal sheets — theme-invariant by design
    // Status (translucent fills with solid text for readability)
    successText: '#15803d', // emerald-700
    warningText: '#b45309', // amber-700
    errorText:   '#be123c', // rose-700
    // Interactive
    rowHoverBg:  '#f8fafc', // slate-50
    selectedBg:  '#f1f5f9', // slate-100
    // Nav / chrome
    tabBarBg:    '#ffffff',
    tabBarBorder: '#e2e8f0',
    tabActive:   BRAND.primary.light,
    tabInactive: '#94a3b8', // slate-400
  },
  dark: {
    // Surfaces
    screenBg:   '#030712', // gray-950
    cardBg:     '#111827', // gray-900
    inputBg:    '#1f2937', // gray-800
    surfaceSubtle: '#1f2937', // gray-800 — recessed neutral surface (inner cards, quiet buttons, skeletons)
    // Borders
    borderSubtle:      '#1f2937', // gray-800
    borderInteractive: '#374151', // gray-700
    // Text
    textPrimary:   '#ffffff',
    textSecondary: '#d1d5db', // gray-300
    textTertiary:  '#9ca3af', // gray-400
    textMuted:     '#6b7280', // gray-500
    textLabel:     '#9ca3af', // gray-400
    textPlaceholder: '#6b7280', // gray-500
    // Brand
    primary:      BRAND.primary.dark,
    primaryHover: BRAND.primaryHover.dark,
    accent:       BRAND.accent.dark,
    accentHover:  BRAND.accentHover.dark,
    accentText:   '#020617', // slate-950 — same: teal has low contrast with white
    onPrimary:    '#ffffff',
    onPrimaryTint: 'rgba(255,255,255,0.18)',
    // Overlays
    modalScrim: 'rgba(0,0,0,0.6)',
    // Status
    successText: '#34d399', // emerald-400
    warningText: '#fbbf24', // amber-400
    errorText:   '#fb7185', // rose-400
    // Interactive
    rowHoverBg:  '#1f2937', // gray-800
    selectedBg:  '#1f2937', // gray-800
    // Nav / chrome
    tabBarBg:    '#111827', // gray-900
    tabBarBorder: '#1f2937',
    tabActive:   BRAND.primary.dark,
    tabInactive: '#6b7280', // gray-500
  },
} as const

export type ThemeColors = { [K in keyof typeof COLORS.light]: string }

// Three-mode preference mirroring the web `wodalytics-theme` localStorage value
// (apps/web/CLAUDE.md → *Cross-app contracts*). Persists to AsyncStorage so the
// choice survives app restarts.
export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'wodalytics-theme'

function isValidMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  isDark: boolean
  colors: ThemeColors
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Wraps the app so descendants share a single, persisted preference. Mounted
// in `App.tsx` alongside the other providers; uses `useColorScheme()` as the
// fallback when `mode === 'system'`.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('system')

  // Hydrate the persisted preference on mount. AsyncStorage failures fall back
  // to 'system' silently — the OS preference is still applied below, so the
  // user experience degrades to "no manual override" rather than crashing.
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return
        if (isValidMode(raw)) setModeState(raw)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function setMode(next: ThemeMode) {
    setModeState(next)
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }

  const effective = mode === 'system' ? systemScheme : mode
  const isDark = effective === 'dark'
  const colors: ThemeColors = isDark ? COLORS.dark : COLORS.light

  return createElement(ThemeContext.Provider, { value: { mode, setMode, isDark, colors } }, children)
}

// Returns the active palette + theme controls. When no provider is mounted
// (e.g. legacy tests, snapshot tools), falls back to OS color scheme without
// the persistence/setMode surface — `setMode` becomes a no-op and `mode`
// reflects the OS scheme directly. Existing callers that only destructure
// `{ isDark, colors }` keep working unchanged.
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  const systemScheme = useColorScheme()
  if (ctx) return ctx
  const isDark = systemScheme === 'dark'
  const fallbackMode: ThemeMode = systemScheme === 'light' ? 'light' : systemScheme === 'dark' ? 'dark' : 'system'
  return {
    mode: fallbackMode,
    setMode: () => {},
    isDark,
    colors: isDark ? COLORS.dark : COLORS.light,
  }
}
