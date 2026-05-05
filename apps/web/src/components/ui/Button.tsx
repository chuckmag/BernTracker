import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950'

const BASE =
  `inline-flex items-center justify-center text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`

const VARIANTS: Record<ButtonVariant, string> = {
  primary:     'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white',
  secondary:   'px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200',
  tertiary:    'px-3 py-1.5 rounded text-slate-500 hover:text-slate-950 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800',
  destructive: 'px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white',
}

export default function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={[BASE, VARIANTS[variant], className].filter(Boolean).join(' ')} {...rest} />
}
