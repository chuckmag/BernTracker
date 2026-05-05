interface PersonalProgramIconProps {
  size?: number
  className?: string
  /**
   * Accessible label. When omitted the icon is rendered as decorative
   * (`aria-hidden`); the consumer is expected to pair it with adjacent text.
   */
  title?: string
}

/**
 * Single-person silhouette with a small "+" badge — reads as "extra work for
 * just me" alongside the gym's class programming. Pairs visually with
 * `UsersIcon` (multiple people = leaderboard / shared) so the contrast on the
 * feed tiles is unambiguous.
 */
export default function PersonalProgramIcon({ size = 16, className, title }: PersonalProgramIconProps) {
  const decorative = !title
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={title}
      className={className}
    >
      {/* Single person */}
      <circle cx={10} cy={8} r={3.2} />
      <path d="M4 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      {/* Small "+" badge top-right corner — "you, plus extra" */}
      <path d="M18 4v5" />
      <path d="M15.5 6.5h5" />
    </svg>
  )
}
