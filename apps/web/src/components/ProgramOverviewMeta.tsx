import type { Program } from '../lib/api'

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—'
}

interface ProgramOverviewMetaProps {
  program: Program
  // When provided, the members count becomes a button that fires `onOpenMembers`.
  // Used by the gym-scoped page to jump to the Members tab. Admin path passes
  // neither prop since unaffiliated programs don't surface members.
  onOpenMembers?: () => void
}

/**
 * Read-only overview block shared by gym-scoped `ProgramDetail` and the
 * admin `AdminProgramDetail` page (#160). Renders start/end dates plus
 * member + workout counts. Visual surface only — no scope-specific
 * affordances live here.
 */
export default function ProgramOverviewMeta({ program, onOpenMembers }: ProgramOverviewMetaProps) {
  const memberCount = program._count?.members ?? 0
  const workoutCount = program._count?.workouts ?? 0
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm mb-8">
      <div>
        <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Start date</dt>
        <dd className="text-white">{fmt(program.startDate)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">End date</dt>
        <dd className="text-white">{fmt(program.endDate)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Members</dt>
        <dd className="text-white">
          {onOpenMembers ? (
            <button
              type="button"
              onClick={onOpenMembers}
              className="text-white hover:text-indigo-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 rounded"
            >
              {memberCount}
            </button>
          ) : (
            memberCount
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wider text-gray-400 mb-1">Workouts</dt>
        <dd className="text-white">{workoutCount}</dd>
      </div>
    </dl>
  )
}
