interface BarbellIconProps {
  /** Loaded shows weight plates on each end of the bar; empty shows just the bar + sleeves. */
  loaded: boolean
  /** Width/height in px. Square. Defaults to 24. */
  size?: number
  className?: string
  /**
   * Accessible label. When omitted the icon is rendered as decorative
   * (`aria-hidden`); the consumer is expected to pair it with adjacent text.
   */
  title?: string
}

// Inline SVG. The geometry is symmetric around x=12 with the bar drawn first
// and plates layered on top — sized so two plates per side fit cleanly inside
// a 24×24 viewBox at 18–24px render sizes (the feed tile size).
export default function BarbellIcon({ loaded, size = 24, className, title }: BarbellIconProps) {
  const decorative = !title
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      className={className}
    >
      {/* Bar shaft. Shorter when plates are loaded so the plates clamp on the
          ends without overlapping the grip. */}
      <line x1={loaded ? 7.5 : 4} y1={12} x2={loaded ? 16.5 : 20} y2={12} strokeWidth={1.6} />

      {/* Sleeves / collars — small inner stops where the plates rest. Always
          drawn so the empty state still reads as a barbell, not a stick. */}
      <line x1={loaded ? 7.5 : 5.5} y1={9.5} x2={loaded ? 7.5 : 5.5} y2={14.5} strokeWidth={2} />
      <line x1={loaded ? 16.5 : 18.5} y1={9.5} x2={loaded ? 16.5 : 18.5} y2={14.5} strokeWidth={2} />

      {loaded && (
        <>
          {/* Inner plates — taller, sit closest to the sleeve. */}
          <rect x={5.4} y={6.5} width={1.8} height={11} rx={0.45} fill="currentColor" stroke="none" />
          <rect x={16.8} y={6.5} width={1.8} height={11} rx={0.45} fill="currentColor" stroke="none" />
          {/* Outer plates — shorter, hang off the ends. */}
          <rect x={3.4} y={8.5} width={1.4} height={7} rx={0.4} fill="currentColor" stroke="none" />
          <rect x={19.2} y={8.5} width={1.4} height={7} rx={0.4} fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}
