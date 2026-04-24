import type { ReactNode } from 'react'
import Chip from './Chip'

interface ChipGroupProps {
  children: ReactNode
  onClear?: () => void
  className?: string
}

export default function ChipGroup({ children, onClear, className = '' }: ChipGroupProps) {
  return (
    <div
      role="group"
      className={[
        'flex items-center gap-2 overflow-x-auto',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
      {onClear && (
        <Chip variant="neutral" onToggle={onClear} aria-label="Clear filters">
          Clear
        </Chip>
      )}
    </div>
  )
}
