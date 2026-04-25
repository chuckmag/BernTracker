import { useState, useEffect, useRef } from 'react'
import TurndownService from 'turndown'
// @ts-expect-error — turndown-plugin-gfm ships no types
import { gfm } from 'turndown-plugin-gfm'
import { api, TYPE_ABBR, type GymProgram, type Movement, type NamedWorkout, type Role, type Workout, type WorkoutStatus, type WorkoutType } from '../lib/api'
import { WORKOUT_CATEGORIES, WORKOUT_TYPE_STYLES, typesInCategory } from '../lib/workoutTypeStyles'
import { useMovements } from '../context/MovementsContext.tsx'

// Single Turndown instance handles HTML→Markdown conversion when the user pastes
// rich content (e.g., tables copied from a web page) into the description.
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})
turndownService.use(gfm)

const AUTOSAVE_DEBOUNCE_MS = 2000
// Content thresholds that prevent accidentally creating empty drafts when the user
// opens the drawer and immediately closes it.
const AUTOSAVE_MIN_TITLE = 3
const AUTOSAVE_MIN_DESCRIPTION = 5

interface WorkoutDrawerProps {
  gymId: string
  dateKey: string | null
  workout?: Workout
  workoutsOnDay: Workout[]
  userGymRole?: Role | null
  onClose: () => void
  onSaved: () => void
  onAutoSaved?: () => void
  onReordered?: () => void
  onWorkoutSelect: (id: string) => void
  onNewWorkout: () => void
}

function buildSnapshot(args: {
  title: string
  description: string
  type: WorkoutType
  namedWorkoutId: string | null
  movementIds: string[]
  programId: string | null
}): string {
  return JSON.stringify({
    title: args.title.trim(),
    description: args.description,
    type: args.type,
    namedWorkoutId: args.namedWorkoutId,
    movementIds: args.movementIds,
    programId: args.programId,
  })
}

export default function WorkoutDrawer({ gymId, dateKey, workout, workoutsOnDay, userGymRole, onClose, onSaved, onAutoSaved, onReordered, onWorkoutSelect, onNewWorkout }: WorkoutDrawerProps) {
  const isOpen = dateKey !== null

  const allMovements = useMovements()
  const [programs, setPrograms] = useState<GymProgram[]>([])
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programId, setProgramId] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WorkoutType>('AMRAP')
  const [description, setDescription] = useState('')
  const [namedWorkouts, setNamedWorkouts] = useState<NamedWorkout[]>([])
  const [namedWorkoutId, setNamedWorkoutId] = useState<string | null>(null)
  const [selectedMovements, setSelectedMovements] = useState<Movement[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [movementSearch, setMovementSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [detectLoading, setDetectLoading] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // When autosave creates a new workout, the drawer keeps editing it locally rather
  // than waiting for the parent to pipe a `workout` prop back in (which would reset
  // the form mid-edit). `localWorkoutId` and `localStatus` drive the edit/published
  // modes so the flow is seamless across the create→edit boundary.
  const [localWorkoutId, setLocalWorkoutId] = useState<string | null>(workout?.id ?? null)
  const [localStatus, setLocalStatus] = useState<WorkoutStatus>(workout?.status ?? 'DRAFT')
  const [autosaving, setAutosaving] = useState(false)
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null)

  const autosaveInFlightRef = useRef<Promise<void> | null>(null)
  const lastAutosaveSnapshotRef = useRef<string | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)

  const isEdit = !!localWorkoutId
  const isPublished = localStatus === 'PUBLISHED'

  useEffect(() => {
    if (!isOpen) return
    api.namedWorkouts.list()
      .then(setNamedWorkouts)
      .catch(() => {}) // non-fatal
    if (isEdit) return
    setProgramsLoading(true)
    api.gyms.programs.list(gymId)
      .then((list) => {
        setPrograms(list)
        setProgramId((prev) => prev || list[0]?.programId || '')
      })
      .catch(() => setError('Failed to load programs'))
      .finally(() => setProgramsLoading(false))
  }, [isOpen, isEdit, gymId])

  useEffect(() => {
    if (!isOpen) return
    setTitle(workout?.title ?? '')
    setType(workout?.type ?? 'AMRAP')
    setDescription(workout?.description ?? '')
    setProgramId(workout?.programId ?? '')
    setNamedWorkoutId(workout?.namedWorkoutId ?? null)
    setSelectedMovements(workout?.workoutMovements?.map((wm) => wm.movement) ?? [])
    setDismissedIds(new Set())
    setMovementSearch('')
    setSearchOpen(false)
    setSuggestError(null)
    setError(null)
    setShowPublishConfirm(false)
    setShowDeleteConfirm(false)
    setLocalWorkoutId(workout?.id ?? null)
    setLocalStatus(workout?.status ?? 'DRAFT')
    setAutosavedAt(null)
    // Seed the autosave comparison with the initial state so that merely opening the
    // drawer (without edits) doesn't trigger a save.
    lastAutosaveSnapshotRef.current = buildSnapshot({
      title: workout?.title ?? '',
      description: workout?.description ?? '',
      type: workout?.type ?? 'AMRAP',
      namedWorkoutId: workout?.namedWorkoutId ?? null,
      movementIds: workout?.workoutMovements?.map((wm) => wm.movement.id) ?? [],
      programId: workout?.id ? null : (workout?.programId ?? ''),
    })
  }, [isOpen, workout?.id])

  // programId is part of the snapshot only while the workout is still being created.
  // Once it exists server-side, the program is immutable, so further edits to the
  // dropdown must not flag a "change" that would re-trigger autosave.
  const snapshot = buildSnapshot({
    title,
    description,
    type,
    namedWorkoutId,
    movementIds: selectedMovements.map((m) => m.id),
    programId: localWorkoutId ? null : programId,
  })

  const canAutosave =
    isOpen &&
    !isPublished &&
    !saving &&
    !deleting &&
    title.trim().length >= AUTOSAVE_MIN_TITLE &&
    description.trim().length >= AUTOSAVE_MIN_DESCRIPTION &&
    (localWorkoutId !== null || programId !== '')

  async function runAutosave(): Promise<void> {
    if (autosaveInFlightRef.current) return
    if (!canAutosave) return
    if (lastAutosaveSnapshotRef.current === snapshot) return

    const snapshotAtSave = snapshot
    const movementIds = selectedMovements.map((m) => m.id)

    const task = (async () => {
      setAutosaving(true)
      try {
        if (localWorkoutId) {
          await api.workouts.update(localWorkoutId, {
            title: title.trim(),
            description,
            type,
            movementIds,
            namedWorkoutId,
          })
          lastAutosaveSnapshotRef.current = snapshotAtSave
        } else {
          const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
          const created = await api.workouts.create(gymId, {
            programId,
            title: title.trim(),
            description,
            type,
            scheduledAt,
            movementIds,
            namedWorkoutId: namedWorkoutId ?? undefined,
          })
          setLocalWorkoutId(created.id)
          setLocalStatus(created.status)
          // After create, programId drops out of future snapshots — store the
          // post-create shape so the next render doesn't look dirty.
          lastAutosaveSnapshotRef.current = buildSnapshot({
            title,
            description,
            type,
            namedWorkoutId,
            movementIds,
            programId: null,
          })
        }
        setAutosavedAt(new Date())
        onAutoSaved?.()
      } catch {
        // Autosave failures stay silent; the user can still manually Save/Publish,
        // which surfaces errors via the normal error state.
      } finally {
        setAutosaving(false)
      }
    })()

    autosaveInFlightRef.current = task
    try {
      await task
    } finally {
      autosaveInFlightRef.current = null
    }
  }

  // Debounced autosave — 2s after the last edit
  useEffect(() => {
    if (!canAutosave) return
    if (lastAutosaveSnapshotRef.current === snapshot) return
    const timer = setTimeout(() => { runAutosave() }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, canAutosave])

  // Flush pending autosaves on close so the user never loses in-flight edits
  async function handleClose() {
    const pending = autosaveInFlightRef.current
    if (pending) await pending
    if (canAutosave && lastAutosaveSnapshotRef.current !== snapshot) {
      await runAutosave()
    }
    onClose()
  }

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, snapshot, canAutosave, localWorkoutId])

  // Auto-detect movements from description (debounced 800ms)
  useEffect(() => {
    if (!isOpen || !description.trim() || allMovements.length === 0) return
    const timer = setTimeout(() => {
      setDetectLoading(true)
      api.movements.detect(description)
        .then((detected) => {
          setSelectedMovements((prev) => {
            const currentIds = new Set(prev.map((m) => m.id))
            const toAdd = detected.filter((m) => !currentIds.has(m.id) && !dismissedIds.has(m.id))
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev
          })
        })
        .catch(() => {})
        .finally(() => setDetectLoading(false))
    }, 800)
    return () => clearTimeout(timer)
    // dismissedIds intentionally omitted — closure captures current value without triggering re-runs on dismiss
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, isOpen, allMovements.length])

  function handleApplyTemplate() {
    const nw = namedWorkouts.find((n) => n.id === namedWorkoutId)
    if (!nw?.templateWorkout) return
    setTitle(nw.name)
    setType(nw.templateWorkout.type)
    setDescription(nw.templateWorkout.description)
    setSelectedMovements(nw.templateWorkout.workoutMovements?.map((wm) => wm.movement) ?? [])
    setDismissedIds(new Set())
  }

  // When the clipboard carries HTML (e.g., a table copied from a web page), convert
  // it to markdown at paste time so the rendered description preserves the structure.
  function handleDescriptionPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    if (!html || !html.trim()) return
    let md = ''
    try {
      md = turndownService.turndown(html).trim()
    } catch {
      return
    }
    if (!md) return
    e.preventDefault()
    const ta = e.currentTarget
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = description.slice(0, start) + md + description.slice(end)
    setDescription(next)
    requestAnimationFrame(() => {
      const el = descriptionRef.current
      if (!el) return
      const pos = start + md.length
      el.setSelectionRange(pos, pos)
      el.focus()
    })
  }

  function validate() {
    if (!isEdit && !programId) { setError('Program is required'); return false }
    if (!title.trim()) { setError('Title is required'); return false }
    if (!description.trim()) { setError('Description is required'); return false }
    return true
  }

  async function handleSaveDraft() {
    if (!validate()) return
    // Wait for any in-flight autosave so we PATCH the canonical server state.
    const pending = autosaveInFlightRef.current
    if (pending) await pending
    setSaving(true)
    setError(null)
    try {
      const movementIds = selectedMovements.map((m) => m.id)
      if (localWorkoutId) {
        await api.workouts.update(localWorkoutId, { title: title.trim(), description, type, movementIds, namedWorkoutId })
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        await api.workouts.create(gymId, { programId, title: title.trim(), description, type, scheduledAt, movementIds, namedWorkoutId: namedWorkoutId ?? undefined })
      }
      onSaved()
      setSaving(false)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!validate()) return
    const pending = autosaveInFlightRef.current
    if (pending) await pending
    setSaving(true)
    setError(null)
    try {
      const movementIds = selectedMovements.map((m) => m.id)
      let id = localWorkoutId
      if (id) {
        await api.workouts.update(id, { title: title.trim(), description, type, movementIds, namedWorkoutId })
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        const created = await api.workouts.create(gymId, { programId, title: title.trim(), description, type, scheduledAt, movementIds, namedWorkoutId: namedWorkoutId ?? undefined })
        id = created.id
      }
      await api.workouts.publish(id!)
      onSaved()
      setSaving(false)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!localWorkoutId) return
    setDeleting(true)
    setError(null)
    try {
      await api.workouts.delete(localWorkoutId)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  async function handleReorder(direction: 'up' | 'down') {
    if (!localWorkoutId) return
    const currentIndex = workoutsOnDay.findIndex((w) => w.id === localWorkoutId)
    if (currentIndex < 0) return
    const current = workoutsOnDay[currentIndex]
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= workoutsOnDay.length) return
    const target = workoutsOnDay[targetIndex]
    setReordering(true)
    setError(null)
    try {
      await Promise.all([
        api.workouts.update(current.id, { dayOrder: target.dayOrder }),
        api.workouts.update(target.id, { dayOrder: current.dayOrder }),
      ])
      onReordered?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReordering(false)
    }
  }

  const canReorder = isEdit && workoutsOnDay.length > 1 && (userGymRole === 'OWNER' || userGymRole === 'PROGRAMMER')

  const displayDate = dateKey
    ? new Date(dateKey + 'T12:00:00').toLocaleDateString('default', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : ''

  const programName =
    workout?.program?.name ??
    programs.find((gp) => gp.programId === programId)?.program.name ??
    '—'

  const autosaveLabel = isPublished
    ? null
    : autosaving
      ? 'Autosaving…'
      : autosavedAt
        ? 'Saved'
        : null

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-30" onClick={handleClose} />
      )}

      <div
        className={[
          'fixed top-0 right-0 h-full w-96 bg-gray-900 border-l border-gray-800 z-40',
          'flex flex-col shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{displayDate}</p>
            <h2 className="text-base font-semibold">{isEdit ? 'Edit Workout' : 'New Workout'}</h2>
          </div>
          <div className="flex items-center gap-3">
            {autosaveLabel && (
              <span className="text-[10px] text-gray-400" data-testid="autosave-status">
                {autosaveLabel}
              </span>
            )}
            {isEdit && (
              <span
                className={[
                  'text-xs px-2 py-0.5 rounded-full font-medium border',
                  isPublished
                    ? 'bg-green-900/60 text-green-400 border-green-700/40'
                    : 'bg-yellow-900/40 text-yellow-400 border-yellow-700/30',
                ].join(' ')}
              >
                {isPublished ? 'Published' : 'Draft'}
              </span>
            )}
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-white transition-colors text-xl leading-none"
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Today's Workouts nav — shown when day has multiple workouts or adding to a day with existing workouts */}
          {(workoutsOnDay.length > 1 || (!isEdit && workoutsOnDay.length >= 1)) && (
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-800/30 text-[10px] text-gray-400 uppercase tracking-wider">
                Today's Workouts
              </div>
              {workoutsOnDay.map((w, idx) => {
                const isCurrent = isEdit && w.id === localWorkoutId
                const rowContent = (
                  <>
                    <span className={w.status === 'PUBLISHED' ? 'text-green-400' : 'text-yellow-400'}>
                      {w.status === 'PUBLISHED' ? '●' : '○'}
                    </span>
                    <span className="font-mono text-[10px] text-indigo-400 w-3 shrink-0">
                      {TYPE_ABBR[w.type] ?? '?'}
                    </span>
                    <span className="truncate flex-1">{w.title}</span>
                    {isCurrent && canReorder && (
                      <span className="flex items-center gap-0.5 shrink-0 ml-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReorder('up') }}
                          disabled={idx === 0 || reordering}
                          className="text-gray-500 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed w-7 h-7 flex items-center justify-center rounded transition-colors"
                          title="Move up"
                        >↑</button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReorder('down') }}
                          disabled={idx === workoutsOnDay.length - 1 || reordering}
                          className="text-gray-500 hover:text-white disabled:opacity-25 disabled:cursor-not-allowed w-7 h-7 flex items-center justify-center rounded transition-colors"
                          title="Move down"
                        >↓</button>
                      </span>
                    )}
                  </>
                )
                return isCurrent ? (
                  <div
                    key={w.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 text-white"
                  >
                    {rowContent}
                  </div>
                ) : (
                  <button
                    key={w.id}
                    onClick={() => onWorkoutSelect(w.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-300 hover:bg-gray-800/60 hover:text-white transition-colors"
                  >
                    {rowContent}
                  </button>
                )
              })}
              {isEdit && (
                <button
                  onClick={onNewWorkout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:text-indigo-300 hover:bg-gray-800/40 transition-colors border-t border-gray-800"
                >
                  <span className="text-base leading-none">+</span>
                  <span>Add another workout</span>
                </button>
              )}
            </div>
          )}

          {/* Program — required selector (create) or read-only label (edit) */}
          <div>
            <label htmlFor="wd-program" className="block text-xs text-gray-400 mb-1">
              Program <span className="text-red-400">*</span>
            </label>
            {isEdit ? (
              <p className="text-sm text-white px-3 py-2 bg-gray-800/50 border border-gray-700 rounded">
                {programName}
              </p>
            ) : (
              <select
                id="wd-program"
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                disabled={programsLoading}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {programsLoading && <option value="">Loading programs...</option>}
                {!programsLoading && programs.length === 0 && (
                  <option value="">No programs found — create one in Settings</option>
                )}
                {programs.map((gp) => (
                  <option key={gp.programId} value={gp.programId}>{gp.program.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="wd-type" className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              id="wd-type"
              value={type}
              onChange={(e) => setType(e.target.value as WorkoutType)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              {WORKOUT_CATEGORIES.map((cat) => {
                const visibleTypes = typesInCategory(cat).filter(
                  (t) => !WORKOUT_TYPE_STYLES[t].deprecated || t === type,
                )
                if (visibleTypes.length === 0) return null
                return (
                  <optgroup key={cat} label={cat}>
                    {visibleTypes.map((t) => {
                      const style = WORKOUT_TYPE_STYLES[t]
                      return (
                        <option key={t} value={t}>
                          {style.label}{style.deprecated ? ' (legacy)' : ''}
                        </option>
                      )
                    })}
                  </optgroup>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fran"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Description
              <span className="ml-1 text-gray-400">(supports markdown — paste tables or formatting)</span>
            </label>
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={handleDescriptionPaste}
              placeholder="Workout details, movements, reps…"
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none font-mono"
            />
          </div>

          <div>
            <label htmlFor="wd-named" className="block text-xs text-gray-400 mb-1">Named Workout <span className="text-gray-400">(optional)</span></label>
            <div className="flex gap-2">
              <select
                id="wd-named"
                value={namedWorkoutId ?? ''}
                onChange={(e) => setNamedWorkoutId(e.target.value || null)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">None</option>
                {namedWorkouts.map((nw) => (
                  <option key={nw.id} value={nw.id}>{nw.name}</option>
                ))}
              </select>
              {namedWorkoutId && namedWorkouts.find((n) => n.id === namedWorkoutId)?.templateWorkout && (
                <button
                  type="button"
                  onClick={handleApplyTemplate}
                  className="shrink-0 px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                  title="Copy type, description, and movements from template"
                >
                  Apply Template
                </button>
              )}
            </div>
          </div>

          {(() => {
            const selectedIds = new Set(selectedMovements.map((m) => m.id))
            const searchResults = movementSearch.trim()
              ? allMovements
                  .filter((m) => m.name.toLowerCase().includes(movementSearch.toLowerCase()) && !selectedIds.has(m.id))
                  .slice(0, 6)
              : []
            const hasExactMatch = allMovements.some(
              (m) => m.name.toLowerCase() === movementSearch.trim().toLowerCase()
            )
            return (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Movements
                  {detectLoading && <span className="ml-2 text-gray-400 text-[10px]">detecting…</span>}
                </label>

                {selectedMovements.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedMovements.map((m) => (
                      <span
                        key={m.id}
                        className="flex items-center gap-1 bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded-full"
                      >
                        {m.name}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMovements((prev) => prev.filter((x) => x.id !== m.id))
                            setDismissedIds((prev) => new Set([...prev, m.id]))
                          }}
                          className="flex items-center justify-center w-7 h-7 -mr-1 -my-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full transition-colors"
                          aria-label={`Remove ${m.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    value={movementSearch}
                    onChange={(e) => { setMovementSearch(e.target.value); setSearchOpen(true); setSuggestError(null) }}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && searchResults.length === 1) {
                        e.preventDefault()
                        setSelectedMovements((prev) => [...prev, searchResults[0]])
                        setMovementSearch('')
                        setSearchOpen(false)
                      }
                    }}
                    placeholder="Search movements to add…"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />

                  {searchOpen && movementSearch.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden">
                      {searchResults.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={() => {
                            setSelectedMovements((prev) => [...prev, m])
                            setMovementSearch('')
                            setSearchOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                        >
                          {m.name}
                          {m.parentId && (
                            <span className="ml-1 text-gray-400 text-xs">
                              ({allMovements.find((x) => x.id === m.parentId)?.name ?? 'variation'})
                            </span>
                          )}
                        </button>
                      ))}

                      {!hasExactMatch && (
                        <button
                          type="button"
                          disabled={suggestLoading}
                          onMouseDown={async () => {
                            const name = movementSearch.trim()
                            setSuggestLoading(true)
                            setSuggestError(null)
                            try {
                              const suggested = await api.movements.suggest({ name })
                              setSelectedMovements((prev) => [...prev, suggested])
                              setMovementSearch('')
                              setSearchOpen(false)
                            } catch (e) {
                              setSuggestError((e as Error).message)
                            } finally {
                              setSuggestLoading(false)
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-indigo-400 hover:bg-gray-700 transition-colors border-t border-gray-700 disabled:opacity-50"
                        >
                          {suggestLoading ? 'Suggesting…' : `Suggest "${movementSearch.trim()}" as new movement`}
                        </button>
                      )}

                      {searchResults.length === 0 && hasExactMatch && (
                        <div className="px-3 py-2 text-sm text-gray-500">Already added</div>
                      )}
                    </div>
                  )}
                </div>

                {suggestError && <p className="text-red-400 text-xs mt-1">{suggestError}</p>}
              </div>
            )
          })()}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 space-y-2">
          {showPublishConfirm && (
            <div className="bg-gray-800 rounded p-3">
              <p className="text-sm text-white mb-3">
                Publish this workout? Members will be able to see and log results.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowPublishConfirm(false); handlePublish() }}
                  disabled={saving}
                  className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? 'Publishing...' : 'Confirm Publish'}
                </button>
                <button
                  onClick={() => setShowPublishConfirm(false)}
                  disabled={saving}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showDeleteConfirm && (
            <div className="bg-gray-800 rounded p-3">
              <p className="text-sm text-white mb-3">Delete this workout? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showPublishConfirm && !showDeleteConfirm && (
            <>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white text-sm py-2 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                {!isPublished && (
                  <button
                    onClick={() => setShowPublishConfirm(true)}
                    disabled={saving}
                    className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-2 rounded transition-colors disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
              </div>
              {isEdit && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving || deleting}
                  className="w-full text-red-400 hover:text-red-300 text-sm py-1.5 transition-colors disabled:opacity-50"
                >
                  Delete workout
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
