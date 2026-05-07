import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { api, type GymProgram } from '../lib/api'
import { useGym } from './GymContext.tsx'

/**
 * Multi-program filter for Feed + Calendar — and the source of truth for the
 * sidebar ProgramFilterPicker.
 *
 * Source of truth:
 *   1. URL `?programIds=id1,id2` on the filterable pages (`/feed`, `/calendar`)
 *      takes precedence — it makes filtered links shareable and survives
 *      browser refresh.
 *   2. Otherwise, fall back to localStorage `programFilter:<gymId>` so the
 *      picker selection survives navigation across pages and across sessions.
 *
 * Empty selection means "all programs" (no `programIds` sent to the API).
 *
 * Personal program: the virtual ID `PERSONAL_PROGRAM_SENTINEL` (`'__personal__'`)
 * represents the user's private personal program in the filter. Consumers must
 * strip it from `gymProgramIds` before passing to gym API endpoints (the sentinel
 * is not a real database ID). Use `gymProgramIds` instead of `selected` whenever
 * calling the gym workouts API.
 *
 * Mobile parity: when the React Native client lands, mirror this contract:
 *   - storage key: `programFilter:<gymId>`
 *   - value: JSON-encoded string array of programIds (may include sentinel)
 *   - filter shape on the server: `?programIds=id1,id2` (sentinel stripped)
 * See also `apps/web/src/components/ProgramFilterPicker.tsx`.
 */

/** Virtual ID representing the user's personal program in the filter selection. */
export const PERSONAL_PROGRAM_SENTINEL = '__personal__'

interface ProgramFilterValue {
  selected: string[]
  /** `selected` with the personal-program sentinel removed — safe to pass to gym API endpoints. */
  gymProgramIds: string[]
  available: GymProgram[]
  /** The real database ID of the user's personal program, once loaded. */
  personalProgramId: string | null
  loading: boolean
  setSelected: (ids: string[]) => void
  toggle: (id: string) => void
  clear: () => void
}

const ProgramFilterContext = createContext<ProgramFilterValue | null>(null)

const FILTERABLE_PATHS = ['/feed', '/calendar']

function storageKey(gymId: string | null): string | null {
  return gymId ? `programFilter:${gymId}` : null
}

function readStorage(gymId: string | null): string[] {
  const key = storageKey(gymId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function ProgramFilterProvider({ children }: { children: React.ReactNode }) {
  const { gymId } = useGym()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [available, setAvailable] = useState<GymProgram[]>([])
  const [personalProgramId, setPersonalProgramId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [storedSelection, setStoredSelection] = useState<string[]>([])
  const lastGymIdRef = useRef<string | null>(null)

  // Hydrate from localStorage and fetch available programs whenever gymId changes.
  useEffect(() => {
    if (!gymId) {
      setAvailable([])
      setPersonalProgramId(null)
      setStoredSelection([])
      lastGymIdRef.current = null
      return
    }
    if (lastGymIdRef.current !== gymId) {
      lastGymIdRef.current = gymId
      setStoredSelection(readStorage(gymId))
    }
    let cancelled = false
    setLoading(true)
    // Fetch gym programs (role-filtered) and personal program ID in parallel.
    // Personal program GET is idempotent — it upserts on first call.
    Promise.all([
      api.me.programs(gymId),
      api.me.personalProgram.get(),
    ])
      .then(([list, personal]) => {
        if (!cancelled) {
          setAvailable(list)
          setPersonalProgramId(personal.id)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable([])
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [gymId])

  const isFilterable = FILTERABLE_PATHS.includes(location.pathname)

  const fromUrl = useMemo<string[] | null>(() => {
    if (!isFilterable) return null
    const raw = searchParams.get('programIds')
    if (raw === null) return null
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }, [isFilterable, searchParams])

  const selected = fromUrl ?? storedSelection

  function persist(ids: string[]) {
    const key = storageKey(gymId)
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(ids)) } catch { /* ignore quota */ }
    }
    setStoredSelection(ids)
  }

  function setSelected(ids: string[]) {
    persist(ids)
    if (isFilterable) {
      const next = new URLSearchParams(searchParams)
      if (ids.length === 0) next.delete('programIds')
      else next.set('programIds', ids.join(','))
      setSearchParams(next, { replace: true })
    }
  }

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  function clear() {
    setSelected([])
  }

  const gymProgramIds = selected.filter((id) => id !== PERSONAL_PROGRAM_SENTINEL)
  const value: ProgramFilterValue = { selected, gymProgramIds, available, personalProgramId, loading, setSelected, toggle, clear }
  return <ProgramFilterContext.Provider value={value}>{children}</ProgramFilterContext.Provider>
}

export function useProgramFilter(): ProgramFilterValue {
  const ctx = useContext(ProgramFilterContext)
  if (!ctx) throw new Error('useProgramFilter must be used inside ProgramFilterProvider')
  return ctx
}
