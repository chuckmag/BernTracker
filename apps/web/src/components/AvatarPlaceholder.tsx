interface AvatarPlaceholderProps {
  firstName: string | null
  lastName: string | null
  email: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Record<NonNullable<AvatarPlaceholderProps['size']>, string> = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-24 h-24 text-2xl',
}

function initialsOf(firstName: string | null, lastName: string | null, email: string): string {
  const f = firstName?.trim()?.[0]
  const l = lastName?.trim()?.[0]
  if (f && l) return `${f}${l}`.toUpperCase()
  if (f) return f.toUpperCase()
  return email[0]?.toUpperCase() ?? '?'
}

export default function AvatarPlaceholder({ firstName, lastName, email, size = 'md' }: AvatarPlaceholderProps) {
  return (
    <div
      className={[
        SIZE_CLASS[size],
        'rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center font-semibold text-white shrink-0',
      ].join(' ')}
      aria-hidden="true"
    >
      {initialsOf(firstName, lastName, email)}
    </div>
  )
}
