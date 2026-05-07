import { Link } from 'react-router-dom'
import type { Program } from '../lib/api'
import { VisibilityBadge, DefaultBadge } from '../pages/ProgramDetail'

function formatDateRange(start: string, end: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start).toLocaleDateString(undefined, opts)
  if (!end) return `From ${s}`
  const e = new Date(end).toLocaleDateString(undefined, opts)
  return `${s} – ${e}`
}

interface ProgramCardProps {
  program: Program
  // The card's URL. Gym-scoped + admin lists both link to a program detail
  // page but at different paths, so the consumer supplies the link.
  to: string
  // Gym-default star — only shown when the program is the gym's default program.
  // null/undefined for admin (unaffiliated programs have no gym default).
  isDefault?: boolean
}

export default function ProgramCard({ program, to, isDefault }: ProgramCardProps) {
  const stripe = program.coverColor ?? '#374151'
  const memberCount = program._count?.members ?? 0
  const workoutCount = program._count?.workouts ?? 0
  return (
    <Link
      to={to}
      className="group bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg overflow-hidden hover:border-slate-300 dark:hover:border-gray-700 transition-colors"
    >
      <div style={{ backgroundColor: stripe }} className="h-1.5 w-full" />
      <div className="p-4">
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="font-semibold text-slate-950 dark:text-white truncate group-hover:text-primary dark:group-hover:text-primary transition-colors flex-1 min-w-0">
            {program.name}
          </h3>
          {isDefault && <DefaultBadge className="shrink-0" />}
          <VisibilityBadge visibility={program.visibility} className="shrink-0" />
        </div>
        {program.description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-gray-400 line-clamp-2">{program.description}</p>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-gray-400">{formatDateRange(program.startDate, program.endDate)}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-gray-400">
          <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
          <span className="text-slate-300 dark:text-gray-700" aria-hidden="true">·</span>
          <span>{workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'}</span>
        </div>
      </div>
    </Link>
  )
}
