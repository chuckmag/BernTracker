export type SkeletonVariant = 'feed-row' | 'history-row' | 'calendar-cell'

interface SkeletonProps {
  variant: SkeletonVariant
  count?: number
  className?: string
}

const VARIANT_SHAPE: Record<SkeletonVariant, string> = {
  'feed-row':      'h-[60px] rounded-lg bg-gray-900',
  'history-row':   'h-[52px] rounded-lg bg-gray-900',
  'calendar-cell': 'h-24 rounded bg-gray-900',
}

const VARIANT_GAP: Record<SkeletonVariant, string> = {
  'feed-row':      'space-y-2',
  'history-row':   'space-y-1',
  'calendar-cell': 'space-y-px',
}

export default function Skeleton({ variant, count = 1, className = '' }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={['animate-pulse', VARIANT_GAP[variant], className].filter(Boolean).join(' ')}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={VARIANT_SHAPE[variant]} />
      ))}
    </div>
  )
}
