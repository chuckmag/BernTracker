interface UsersIconProps {
  size?: number
  className?: string
  title?: string
}

// Two overlapping head+shoulders silhouettes. Used inline next to a numeric
// "N results" label on the feed tile and elsewhere where a small "people"
// affordance is needed.
export default function UsersIcon({ size = 14, className, title }: UsersIconProps) {
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
      {/* Front person */}
      <circle cx={9} cy={8} r={3.2} />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      {/* Back person, offset right and slightly up */}
      <path d="M16 11.2a3 3 0 1 0 0-6" />
      <path d="M21 18.5c0-2.4-1.7-4.5-4-5.2" />
    </svg>
  )
}
