/**
 * Minimal circular progress ring rendered as inline SVG.
 *
 * Used by GoalsCard and the /goals list to visualize percent-complete
 * without pulling in a charting dependency for what's a one-shape primitive.
 * Theme-aware via the standard slate/gray palette; the filled arc is the
 * brand `primary` color.
 *
 * Accessibility: the wrapper sets `role="img"` + `aria-label` describing
 * the percent so screen readers don't read the raw SVG. Decorative
 * checkmark glyph is `aria-hidden`.
 */

interface ProgressRingProps {
  /** 0–100; values outside this range are clamped. */
  percent: number
  size?: number
  /** Stroke width in px. */
  strokeWidth?: number
  /**
   * Optional text in the center. Defaults to the rounded percent. Pass
   * an empty string to hide the center number entirely.
   */
  label?: string
  /** Renders a checkmark glyph instead of the percent when complete. */
  complete?: boolean
  className?: string
}

export default function ProgressRing({
  percent,
  size = 56,
  strokeWidth = 6,
  label,
  complete = false,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (clamped / 100) * circumference
  const center = size / 2
  const displayLabel = label ?? `${Math.round(clamped)}%`

  return (
    <div
      role="img"
      aria-label={complete ? 'Goal complete' : `${Math.round(clamped)} percent complete`}
      className={['relative inline-flex items-center justify-center', className ?? ''].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          className="stroke-slate-200 dark:stroke-gray-800"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc — rotated -90° to start at the top */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          className={complete ? 'stroke-emerald-500' : 'stroke-primary'}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {displayLabel !== '' && (
        <span
          className={[
            'absolute text-[11px] font-semibold tabular-nums',
            complete ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-gray-200',
          ].join(' ')}
          aria-hidden="true"
        >
          {complete ? '✓' : displayLabel}
        </span>
      )}
    </div>
  )
}
