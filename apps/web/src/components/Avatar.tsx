interface AvatarProps {
  /** Resolved avatar URL. Falls through to initials when null/empty. */
  avatarUrl?: string | null
  firstName?: string | null
  lastName?: string | null
  email: string
  size?: 'sm' | 'md' | 'lg'
  /** Override the auto label (e.g. "Your profile photo"). */
  alt?: string
}

const SIZE_CLASS: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-24 h-24 text-2xl',
}

function initialsOf(firstName: string | null | undefined, lastName: string | null | undefined, email: string): string {
  const f = firstName?.trim()?.[0]
  const l = lastName?.trim()?.[0]
  if (f && l) return `${f}${l}`.toUpperCase()
  if (f) return f.toUpperCase()
  return email[0]?.toUpperCase() ?? '?'
}

// Renders the user's avatar image when a URL is set; falls back to an
// initials-on-gradient placeholder otherwise. Used in the TopBar, /profile,
// and /onboarding so all three surfaces stay in lockstep.
export default function Avatar({
  avatarUrl,
  firstName = null,
  lastName = null,
  email,
  size = 'md',
  alt,
}: AvatarProps) {
  const sizeClass = SIZE_CLASS[size]
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={alt ?? `${firstName ?? email} avatar`}
        className={[sizeClass, 'rounded-full object-cover bg-gray-800 shrink-0'].join(' ')}
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <div
      className={[
        sizeClass,
        'rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center font-semibold text-white shrink-0',
      ].join(' ')}
      aria-hidden="true"
    >
      {initialsOf(firstName, lastName, email)}
    </div>
  )
}
