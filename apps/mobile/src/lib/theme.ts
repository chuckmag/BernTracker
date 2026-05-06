import { useColorScheme } from 'react-native'

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

export type ThemeColors = typeof COLORS.light

// useTheme — returns the active palette based on the device color scheme.
// When #254 (AsyncStorage-backed preference) lands, update this to read from
// ThemeContext instead so users can override the OS preference.
export function useTheme(): { isDark: boolean; colors: ThemeColors } {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  return { isDark, colors: isDark ? COLORS.dark : COLORS.light }
}
