import type { ReactNode, MouseEvent } from 'react'

export type ChipVariant =
  | 'neutral'
  | 'accent'
  | 'status-published'
  | 'status-draft'
  | 'status-rejected'

interface ChipProps {
  children: ReactNode
  variant?: ChipVariant
  toggled?: boolean
  onToggle?: () => void
  onDismiss?: () => void
  className?: string
  'aria-label'?: string
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950'

const BASE =
  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors'

// Non-toggled / display styles per variant.
const VARIANT_OFF: Record<ChipVariant, string> = {
  neutral:            'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-950 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white',
  accent:             'bg-primary text-white',
  'status-published': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30',
  'status-draft':     'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30',
  'status-rejected':  'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/30',
}

// Toggled-on styles. Neutral: dark pill in light mode, light pill in dark mode.
const VARIANT_ON: Record<ChipVariant, string> = {
  neutral:            'bg-slate-800 text-white dark:bg-gray-200 dark:text-gray-900',
  accent:             'bg-primary/90 text-white',
  'status-published': 'bg-emerald-500/30 text-emerald-800 dark:text-emerald-200 border border-emerald-400/60',
  'status-draft':     'bg-amber-500/30 text-amber-800 dark:text-amber-200 border border-amber-400/60',
  'status-rejected':  'bg-rose-500/30 text-rose-800 dark:text-rose-200 border border-rose-400/60',
}

export default function Chip({
  children,
  variant = 'neutral',
  toggled,
  onToggle,
  onDismiss,
  className = '',
  'aria-label': ariaLabel,
}: ChipProps) {
  const styles = toggled ? VARIANT_ON[variant] : VARIANT_OFF[variant]
  const classes = [BASE, styles, className].filter(Boolean).join(' ')

  const dismissBtn = onDismiss ? (
    <button
      type="button"
      onClick={(e: MouseEvent) => { e.stopPropagation(); onDismiss() }}
      aria-label="Remove"
      className={`ml-0.5 -mr-1.5 -my-1 w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-black/20 ${FOCUS_RING}`}
    >
      ×
    </button>
  ) : null

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={toggled ?? false}
        aria-label={ariaLabel}
        className={`${classes} ${FOCUS_RING}`}
      >
        {children}
        {dismissBtn}
      </button>
    )
  }

  return (
    <span aria-label={ariaLabel} className={classes}>
      {children}
      {dismissBtn}
    </span>
  )
}
