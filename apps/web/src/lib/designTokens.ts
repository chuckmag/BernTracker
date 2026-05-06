// Design token hex values for runtime use (e.g. Recharts chart colors).
// These mirror the CSS custom properties in index.css — update both together.
// Do NOT import these for Tailwind utilities; use `bg-primary`, `text-accent`, etc.

export const BRAND_TOKENS = {
  light: {
    primary:      '#1E5AA8',
    primaryHover: '#1A4D90',
    accent:       '#2BA8A4',
    accentHover:  '#238F8B',
  },
  dark: {
    primary:      '#5B9BE6',
    primaryHover: '#7AB0EE',
    accent:       '#5FD4D0',
    accentHover:  '#7AE4E0',
  },
} as const

// Chart palette — stable categorical colors legible in both modes.
// Order matters: first colour is used for the primary series.
export const CHART_COLORS = {
  light: ['#1E5AA8', '#2BA8A4', '#6366f1', '#f59e0b', '#10b981', '#f43f5e'],
  dark:  ['#5B9BE6', '#5FD4D0', '#818cf8', '#fbbf24', '#34d399', '#fb7185'],
} as const
