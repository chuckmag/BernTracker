import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import { useMovements } from '../context/MovementsContext.tsx'
import { useProgramFilter } from '../context/ProgramFilterContext.tsx'
import WorkoutCalendarBoard from '../components/WorkoutCalendarBoard'
import MovementFilterInput from '../components/MovementFilterInput'
import Chip from '../components/ui/Chip'

export default function Calendar() {
  const { gymId, gymRole: userGymRole } = useGym()
  const scope = useMemo(
    () => makeGymProgramScope({ gymId: gymId ?? '', gymRole: userGymRole ?? null }),
    [gymId, userGymRole],
  )
  const allMovements = useMovements()
  const { selected: programIds, available, clear: clearProgramFilter } = useProgramFilter()
  const [filterMovementIds, setFilterMovementIds] = useState<string[]>([])

  const programIdsKey = programIds.join(',')

  // Single-program filter gets a featured header (color stripe + name).
  // Multi-program gets a compact "Filtered to N programs" eyebrow.
  const singleProgram = programIds.length === 1
    ? available.find(({ program }) => program.id === programIds[0])?.program ?? null
    : null
  // First selected program is the create-mode default for new workouts; with
  // multi-select we can't pre-select an unambiguous default, so fall back to
  // the drawer's existing "first program in list" behavior beyond N=1.
  const defaultProgramIdForCreate = programIds.length === 1 ? programIds[0] : undefined

  const loadWorkouts = useCallback(async (from: string, to: string) => {
    if (!gymId) return []
    const filters = (filterMovementIds.length || programIds.length)
      ? {
          ...(filterMovementIds.length ? { movementIds: filterMovementIds } : {}),
          ...(programIds.length ? { programIds } : {}),
        }
      : undefined
    return api.workouts.list(gymId, from, to, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId, filterMovementIds, programIdsKey])

  if (!gymId) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Calendar</h1>
        <p className="text-slate-500 dark:text-gray-400">Set up your gym in Settings first.</p>
      </div>
    )
  }

  return (
    <div>
      {programIds.length > 0 && (
        <div className="mb-4">
          <Link
            to="/calendar"
            onClick={(e) => { e.preventDefault(); clearProgramFilter() }}
            className="text-xs text-primary hover:opacity-80"
          >
            ← Back to full calendar
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        {singleProgram ? (
          <div className="flex items-start gap-3 min-w-0">
            <div
              style={{ backgroundColor: singleProgram.coverColor ?? '#374151' }}
              className="w-1.5 h-10 rounded-full shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{singleProgram.name}</h1>
              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">Calendar</p>
            </div>
          </div>
        ) : programIds.length > 1 ? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">
              Filtered to {programIds.length} programs
            </p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold">Calendar</h1>
        )}
      </div>

      {/* Sticky movement-filter sub-header */}
      {allMovements.length > 0 && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-4 bg-white/90 dark:bg-gray-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-gray-950/70 border-b border-slate-200 dark:border-gray-800">
          {/* Wide layout: full chip row */}
          <div className="hidden min-[520px]:block">
            <MovementFilterInput
              allMovements={allMovements}
              selectedIds={filterMovementIds}
              onChange={setFilterMovementIds}
            />
          </div>
          {/* Narrow layout: collapsed details/summary */}
          <details className="block min-[520px]:hidden">
            <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden inline-block">
              <Chip variant="neutral">
                Filters{filterMovementIds.length ? ` (${filterMovementIds.length})` : ''}
              </Chip>
            </summary>
            <div className="mt-2">
              <MovementFilterInput
                allMovements={allMovements}
                selectedIds={filterMovementIds}
                onChange={setFilterMovementIds}
              />
            </div>
          </details>
        </div>
      )}

      <WorkoutCalendarBoard
        loadWorkouts={loadWorkouts}
        scope={scope}
        userGymRole={userGymRole}
        defaultProgramId={defaultProgramIdForCreate}
      />
    </div>
  )
}
