interface GymLogoProps {
  logoUrl?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Record<NonNullable<GymLogoProps['size']>, string> = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-10 h-10 text-sm',
  lg: 'w-20 h-20 text-xl',
}

function gymInitials(name: string): string {
  // Split on whitespace + non-letter separators, keep up to 2 leading initials.
  const tokens = name.trim().split(/[\s\-_/]+/).filter(Boolean)
  if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase()
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase()
  return '?'
}

// Renders the gym's logo when present; falls back to initials on a slate
// gradient (distinct from user avatars' indigo→purple so it's visually
// obvious which is which in mixed surfaces like /gym-settings).
export default function GymLogo({ logoUrl, name, size = 'md' }: GymLogoProps) {
  const sizeClass = SIZE_CLASS[size]
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={[sizeClass, 'rounded-lg object-cover bg-slate-200 dark:bg-gray-800 shrink-0'].join(' ')}
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <div
      className={[
        sizeClass,
        'rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-700 dark:to-slate-900 flex items-center justify-center font-semibold text-slate-700 dark:text-gray-200 shrink-0',
      ].join(' ')}
      aria-hidden="true"
    >
      {gymInitials(name)}
    </div>
  )
}
