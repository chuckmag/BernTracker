import { useRef, type KeyboardEvent } from 'react'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950'

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (disabled) return
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const direction = e.key === 'ArrowRight' ? 1 : -1
    const nextIdx = (idx + direction + options.length) % options.length
    const nextOpt = options[nextIdx]
    onChange(nextOpt.value)
    // Move focus to the new segment so the user can keep arrowing.
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
    buttons?.[nextIdx]?.focus()
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center rounded-lg bg-slate-200 dark:bg-gray-800 p-0.5 gap-0.5',
        disabled ? 'opacity-40' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={[
              'px-3 py-1 text-xs font-medium rounded transition-colors',
              FOCUS_RING,
              isSelected
                ? 'bg-white dark:bg-gray-200 text-slate-900 dark:text-gray-900'
                : 'text-slate-600 hover:text-slate-950 dark:text-gray-400 dark:hover:text-white',
              disabled ? 'cursor-not-allowed' : '',
            ].filter(Boolean).join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
