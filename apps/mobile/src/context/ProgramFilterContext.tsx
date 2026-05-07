import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, type GymProgram } from '../lib/api'
import { useGym } from './GymContext'

/**
 * Multi-program filter for the mobile feed.
 *
 * Mirrors the web's ProgramFilterContext (apps/web/src/context/ProgramFilterContext.tsx)
 * and the cross-app contract documented in CLAUDE.md:
 *   - Storage key: `programFilter:<gymId>` (AsyncStorage; same shape as the
 *     web localStorage entry — JSON-encoded `string[]` of program IDs).
 *   - Empty selection means "all programs" (no `programIds` sent to the API).
 *   - API: `GET /api/gyms/:gymId/workouts?programIds=id1,id2`
 *
 * Web's URL-state half (`?programIds=…` on /feed and /calendar) doesn't apply
 * on mobile — there's no shareable URL — so this provider is storage + memory
 * only. Selection survives across navigation and across app launches via
 * AsyncStorage.
 */

interface ProgramFilterValue {
  selected: string[]
  available: GymProgram[]
  /** The default gym program's program ID, or null if there is none. */
  defaultProgramId: string | null
  loading: boolean
  setSelected: (ids: string[]) => void
  toggle: (id: string) => void
  clear: () => void
}

const ProgramFilterContext = createContext<ProgramFilterValue | null>(null)

function storageKey(gymId: string | null): string | null {
  return gymId ? `programFilter:${gymId}` : null
}

async function readStorage(gymId: string | null): Promise<string[]> {
  const key = storageKey(gymId)
  if (!key) return []
  try {
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function writeStorage(gymId: string | null, ids: string[]): Promise<void> {
  const key = storageKey(gymId)
  if (!key) return
  try {
    await AsyncStorage.setItem(key, JSON.stringify(ids))
  } catch {
    // AsyncStorage write failures are non-fatal — the in-memory state still works
    // for the active session; the persistence retry is the user's next mutation.
  }
}

export function ProgramFilterProvider({ children }: { children: React.ReactNode }) {
  const { activeGym } = useGym()
  const gymId = activeGym?.id ?? null
  const [available, setAvailable] = useState<GymProgram[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelectedState] = useState<string[]>([])
  const lastGymIdRef = useRef<string | null>(null)

  // Hydrate selection + fetch available programs whenever the active gym changes.
  // Chained so the prune step (drop IDs no longer in `available`) runs against
  // the actual persisted selection — running storage hydrate and the API fetch
  // in parallel races, and pruning before hydrate is a no-op that lets stale
  // IDs slip through.
  useEffect(() => {
    if (!gymId) {
      setAvailable([])
      setSelectedState([])
      lastGymIdRef.current = null
      return
    }

    let cancelled = false
    setLoading(true)

    ;(async () => {
      const persisted = lastGymIdRef.current === gymId
        ? null // already hydrated for this gym; don't clobber the live state
        : await readStorage(gymId).catch(() => [] as string[])
      if (cancelled) return
      lastGymIdRef.current = gymId
      if (persisted !== null) setSelectedState(persisted)

      let programs: GymProgram[] = []
      try {
        programs = await api.me.programs(gymId)
      } catch {
        if (!cancelled) setAvailable([])
        return
      }
      if (cancelled) return
      setAvailable(programs)

      // Drop any persisted IDs that are no longer reachable for this user
      // (program unsubscribed, deleted, visibility changed). Keeps storage
      // honest with what the picker actually offers. The selected IDs are
      // the underlying Program IDs (program.id), not the GymProgram join row.
      const valid = new Set(programs.map((gp) => gp.program.id))
      const before = persisted ?? selected
      const after = before.filter((id) => valid.has(id))
      if (after.length !== before.length) {
        setSelectedState(after)
        writeStorage(gymId, after)
      }
    })().finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
    // `selected` is intentionally excluded; the captured value via `persisted ?? selected`
    // is only used as the seed when the gym hasn't changed, and we don't want to refetch
    // programs every time the user toggles a chip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gymId])

  const setSelected = useCallback((ids: string[]) => {
    setSelectedState(ids)
    writeStorage(gymId, ids)
  }, [gymId])

  const toggle = useCallback((id: string) => {
    setSelectedState((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      writeStorage(gymId, next)
      return next
    })
  }, [gymId])

  const clear = useCallback(() => {
    setSelectedState([])
    writeStorage(gymId, [])
  }, [gymId])

  const defaultProgramId = useMemo(
    () => available.find((gp) => gp.isDefault && gp.gymId)?.program.id ?? null,
    [available],
  )

  const value = useMemo(
    () => ({ selected, available, defaultProgramId, loading, setSelected, toggle, clear }),
    [selected, available, defaultProgramId, loading, setSelected, toggle, clear],
  )

  return (
    <ProgramFilterContext.Provider value={value}>
      {children}
    </ProgramFilterContext.Provider>
  )
}

export function useProgramFilter() {
  const ctx = useContext(ProgramFilterContext)
  if (!ctx) throw new Error('useProgramFilter must be used inside ProgramFilterProvider')
  return ctx
}
