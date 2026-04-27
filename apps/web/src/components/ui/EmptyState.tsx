import type { ReactNode } from 'react'
import Button from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  body?: string
  cta?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon, title, body, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      {icon && <div className="mb-3 text-gray-500">{icon}</div>}
      <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      {body && <p className="mt-1 text-sm text-gray-500 max-w-sm">{body}</p>}
      {cta && (
        <Button variant="primary" onClick={cta.onClick} className="mt-4">
          {cta.label}
        </Button>
      )}
    </div>
  )
}
