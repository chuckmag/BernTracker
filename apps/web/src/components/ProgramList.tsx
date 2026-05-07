import { useState } from 'react'
import type { Program } from '../lib/api'
import type { ProgramScope } from '../lib/programScope'
import Button from './ui/Button'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import ProgramCard from './ProgramCard'
import ProgramFormDrawer from './ProgramFormDrawer'

export interface ProgramListItem {
  program: Program
  isDefault?: boolean
}

interface Props {
  scope: ProgramScope
  items: ProgramListItem[]
  loading: boolean
  error: string | null
  detailBasePath: string
  onCreated: () => void
  heading?: 'h1' | 'h2'
  description?: string
  emptyTitle?: string
  emptyBody?: string
}

export default function ProgramList({
  scope,
  items,
  loading,
  error,
  detailBasePath,
  onCreated,
  heading = 'h2',
  description,
  emptyTitle = 'No programs yet',
  emptyBody = 'Create a program to organize workouts into a named block you can filter by and assign members to.',
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { canWrite } = scope.capabilities

  const Heading = heading
  const headingClass = heading === 'h1' ? 'text-2xl font-bold' : 'text-lg font-semibold'
  const headerAlign = description ? 'items-start' : 'items-center'

  function handleSaved(_p: Program) {
    setDrawerOpen(false)
    onCreated()
  }

  return (
    <section>
      <div className={`flex ${headerAlign} justify-between mb-6 gap-4`}>
        <div>
          <div className="flex items-center gap-3">
            <Heading className={headingClass}>Programs</Heading>
            <span className="bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-200 text-sm px-2 py-0.5 rounded-full">
              {items.length}
            </span>
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {canWrite && (
          <Button variant="primary" onClick={() => setDrawerOpen(true)}>
            + New Program
          </Button>
        )}
      </div>

      {error && <p className="text-red-400 mb-4">{error}</p>}
      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && items.length === 0 && !error && (
        <EmptyState
          title={emptyTitle}
          body={emptyBody}
          cta={canWrite ? { label: '+ New Program', onClick: () => setDrawerOpen(true) } : undefined}
        />
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(({ program, isDefault }) => (
            <ProgramCard
              key={program.id}
              program={program}
              to={`${detailBasePath}/${program.id}`}
              isDefault={isDefault}
            />
          ))}
        </div>
      )}

      <ProgramFormDrawer
        scope={scope}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  )
}
