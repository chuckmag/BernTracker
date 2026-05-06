export type BadgeVariant = 'neutral' | 'accent'

interface BadgeProps {
  count: number
  variant?: BadgeVariant
  className?: string
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-200 text-slate-700 dark:bg-gray-700 dark:text-gray-200',
  accent:  'bg-primary text-white',
}

export default function Badge({ count, variant = 'accent', className = '' }: BadgeProps) {
  return (
    <span
      aria-label={`${count}`}
      className={[
        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
        VARIANTS[variant],
        className,
      ].filter(Boolean).join(' ')}
    >
      {count}
    </span>
  )
}
