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
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950'

const BASE =
  'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors'

// Non-toggled / display styles per variant.
const VARIANT_OFF: Record<ChipVariant, string> = {
  neutral:            'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white',
  accent:             'bg-indigo-600 text-white',
  'status-published': 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
  'status-draft':     'bg-amber-500/15 text-amber-300 border border-amber-400/30',
  'status-rejected':  'bg-rose-500/15 text-rose-300 border border-rose-400/30',
}

// Toggled-on styles. Neutral mirrors the existing WodDetail filter chip (light pill on dark).
const VARIANT_ON: Record<ChipVariant, string> = {
  neutral:            'bg-gray-200 text-gray-900',
  accent:             'bg-indigo-500 text-white',
  'status-published': 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/60',
  'status-draft':     'bg-amber-500/30 text-amber-200 border border-amber-400/60',
  'status-rejected':  'bg-rose-500/30 text-rose-200 border border-rose-400/60',
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
