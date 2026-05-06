import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type PersonalProgram, type Workout } from '../lib/api'
import { useGym } from '../context/GymContext.tsx'
import { makeGymProgramScope } from '../lib/gymProgramScope'
import { makePersonalProgramScope } from '../lib/personalProgramScope'
import { makeUnifiedCalendarScope } from '../lib/unifiedCalendarScope'
import { useMovements } from '../context/MovementsContext.tsx'
import { useProgramFilter, PERSONAL_PROGRAM_SENTINEL } from '../context/ProgramFilterContext.tsx'
import WorkoutCalendarBoard from '../components/WorkoutCalendarBoard'
import MovementFilterInput from '../components/MovementFilterInput'
import Chip from '../components/ui/Chip'

export default function UnifiedCalendar() {
  const { gymId, gymRole: userGymRole } = useGym()
  const allMovements = useMovements()
  const { selected, gymProgramIds, available, personalProgramId, clear: clearProgramFilter } = useProgramFilter()
  const [filterMovementIds, setFilterMovementIds] = useState<string[]>([])
  const [personalProgram, setPersonalProgram] = useState<PersonalProgram | null>(null)

  // Fetch personal program once so scopes can be built.
  useEffect(() => {
    let cancelled = false
    api.me.personalProgram.get()
      .then((p) => { if (!cancelled) setPersonalProgram(p) })
      .catch(() => { /* non-fatal; personal workouts just won't load */ })
    return () => { cancelled = true }
  }, [])

  // Whether to include personal program workouts in the calendar fetch.
  const includePersonal = personalProgram !== null && (
    selected.length === 0 || selected.includes(PERSONAL_PROGRAM_SENTINEL)
  )
  // Whether the filter selects any gym programs (explicitly or via "all").
  const includeAllGym = gymProgramIds.length === 0 && !selected.includes(PERSONAL_PROGRAM_SENTINEL)
  const includeGym = gymId != null && (includeAllGym || gymProgramIds.length > 0)

  const gymProgramIdsKey = gymProgramIds.join(',')
  const filterMovementIdsKey = filterMovementIds.join(',')

  const loadWorkouts = useCallback(async (from: string, to: string): Promise<Workout[]> => {
    const fetches: Promise<Workout[]>[] = []

    if (includeGym && gymId) {
      const filters = (filterMovementIds.length || gymProgramIds.length)
        ? {
            ...(filterMovementIds.length ? { movementIds: filterMovementIds } : {}),
            ...(gymProgramIds.length ? { programIds: gymProgramIds } : {}),
          }
        : undefined
      fetches.push(api.workouts.list(gymId, from, to, filters))
    }

    if (includePersonal) {
      fetches.push(api.me.personalProgram.workouts.list({ from, to }))
    }

    if (fetches.length === 0) return []

    const results = await Promise.all(fetches)
    const merged = results.flat()
    // Deduplicate by id in case the same workout ID appears in both responses.
    const seen = new Set<string>()
    return merged.filter((w) => {
      if (seen.has(w.id)) return false
      seen.add(w.id)
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId, includeGym, includePersonal, gymProgramIdsKey, filterMovementIdsKey])

  const gymScope = useMemo(
    () => makeGymProgramScope({ gymId: gymId ?? '', gymRole: userGymRole ?? null }),
    [gymId, userGymRole],
  )

  const personalScope = useMemo(
    () => personalProgram ? makePersonalProgramScope({ program: personalProgram }) : null,
    [personalProgram],
  )

  const defaultScope = useMemo(() => {
    if (!personalProgram) return gymScope
    return makeUnifiedCalendarScope({
      gymId: gymId ?? '',
      gymRole: userGymRole ?? null,
      personalProgram,
    })
  }, [gymId, userGymRole, personalProgram, gymScope])

  const resolveScope = useCallback((workout: Workout) => {
    if (personalProgram && workout.programId === personalProgram.id && personalScope) {
      return personalScope
    }
    return gymScope
  }, [personalProgram, personalScope, gymScope])

  // Header: single-program featured view (color stripe + name) when exactly one
  // is selected. For the personal-only case show a dedicated label.
  const isPersonalOnlyFilter = selected.length === 1 && selected[0] === PERSONAL_PROGRAM_SENTINEL
  const singleGymProgram = gymProgramIds.length === 1 && !isPersonalOnlyFilter
    ? available.find(({ program }) => program.id === gymProgramIds[0])?.program ?? null
    : null

  const defaultProgramId = useMemo(() => {
    if (gymProgramIds.length === 1 && singleGymProgram) return gymProgramIds[0]
    if (isPersonalOnlyFilter && personalProgram) return personalProgram.id
    if (personalProgram) return personalProgram.id
    return undefined
  }, [gymProgramIds, singleGymProgram, isPersonalOnlyFilter, personalProgram])

  const hasFilters = selected.length > 0

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
      {hasFilters && (
        <div className="mb-4">
          <Link
            to="/calendar"
            onClick={(e) => { e.preventDefault(); clearProgramFilter() }}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            ← Back to full calendar
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        {isPersonalOnlyFilter ? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Personal Program</h1>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">
              Your private workouts
            </p>
          </div>
        ) : singleGymProgram ? (
          <div className="flex items-start gap-3 min-w-0">
            <div
              style={{ backgroundColor: singleGymProgram.coverColor ?? '#374151' }}
              className="w-1.5 h-10 rounded-full shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{singleGymProgram.name}</h1>
              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">Calendar</p>
            </div>
          </div>
        ) : selected.length > 1 ? (
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Calendar</h1>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-gray-400 mt-0.5">
              Filtered to {selected.length} programs
            </p>
          </div>
        ) : (
          <h1 className="text-2xl font-bold">Calendar</h1>
        )}
      </div>

      {/* Sticky movement-filter sub-header */}
      {allMovements.length > 0 && (
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-4 bg-white/90 dark:bg-gray-950/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-gray-950/70 border-b border-slate-200 dark:border-gray-800">
          <div className="hidden min-[520px]:block">
            <MovementFilterInput
              allMovements={allMovements}
              selectedIds={filterMovementIds}
              onChange={setFilterMovementIds}
            />
          </div>
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
        scope={defaultScope}
        resolveScope={resolveScope}
        userGymRole={userGymRole}
        defaultProgramId={defaultProgramId}
      />
    </div>
  )
}
