import { useState, useEffect, useRef } from 'react'
import TurndownService from 'turndown'
// @ts-expect-error — turndown-plugin-gfm ships no types
import { gfm } from 'turndown-plugin-gfm'
import { api, TYPE_ABBR, type DistanceUnit, type LoadUnit, type Movement, type NamedWorkout, type Program, type Role, type Workout, type WorkoutStatus, type WorkoutType } from '../lib/api'
import type { ProgramScope } from '../lib/programScope'
import { WORKOUT_CATEGORIES, WORKOUT_TYPE_STYLES, typesInCategory } from '../lib/workoutTypeStyles'
import { useMovements } from '../context/MovementsContext.tsx'

// Per-movement prescription as form state — strings everywhere so empty
// inputs are first-class. Coerced to numbers/units at submit time.
interface PrescriptionForm {
  sets:         string
  reps:         string
  load:         string
  loadUnit:     LoadUnit
  // Whether the result form should surface a Load column for this movement.
  // Defaults true — programmer flips off for plyometric supersets and other
  // pieces where Load would be noise on the result form.
  tracksLoad:   boolean
  tempo:        string
  distance:     string
  distanceUnit: DistanceUnit
  calories:     string
  seconds:      string
}

const EMPTY_PRESCRIPTION: PrescriptionForm = {
  sets: '', reps: '', load: '', loadUnit: 'LB', tracksLoad: true, tempo: '',
  distance: '', distanceUnit: 'M', calories: '', seconds: '',
}

function blankPrescription(): PrescriptionForm {
  return { ...EMPTY_PRESCRIPTION }
}

// Categories that surface a workout-level time cap input. AMRAP additionally
// gets the `tracksRounds` toggle. Strength + Skill + Warmup hide both.
const TIME_CAP_TYPES = new Set<WorkoutType>([
  'AMRAP', 'FOR_TIME', 'EMOM', 'METCON', 'TABATA', 'INTERVALS', 'CHIPPER', 'LADDER', 'DEATH_BY',
])

// Type-driven default for which prescription columns to surface in the form.
// Hidden columns are still legal — programmer can flip the disclosure to
// reveal everything — but the default keeps the UI uncluttered for the most
// common case per category.
//
// Strength is intentionally absent of `load`: weight prescriptions for
// strength work are too individualized to express usefully here. A future
// iteration will suggest loads from the member's training history; until
// then, programmers leave load to the member at log-time.
function defaultPrescriptionColumns(type: WorkoutType): Set<keyof PrescriptionForm> {
  const category = WORKOUT_TYPE_STYLES[type].category
  if (category === 'Strength') return new Set(['sets', 'reps', 'tempo'])
  if (category === 'MonoStructural') return new Set(['distance', 'calories', 'seconds'])
  if (category === 'Metcon') return new Set(['sets', 'reps', 'load'])
  return new Set(['sets', 'reps'])
}

// Columns the programmer can ever reach for this workout type. Tightening
// is two-fold:
// - Strength hides `load` (intentional — slice 2B feedback) and also drops
//   distance/calories/seconds since barbell work doesn't have those axes.
// - MonoStructural drops sets/reps/load/tempo — rowing/biking/swimming are
//   timed cardio, not lift work.
// - Metcon / Skill Work / Warmup keep every axis available; their movement
//   mix is too varied to constrain at the workout level.
function availablePrescriptionColumns(type: WorkoutType): Set<keyof PrescriptionForm> {
  const category = WORKOUT_TYPE_STYLES[type].category
  if (category === 'Strength') return new Set(['sets', 'reps', 'tempo'])
  if (category === 'MonoStructural') return new Set(['distance', 'distanceUnit', 'calories', 'seconds'])
  return new Set(['sets', 'reps', 'load', 'loadUnit', 'tempo', 'distance', 'distanceUnit', 'calories', 'seconds'])
}

function parseMmss(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // "20" → 20s; "20:00" → 20 minutes
  if (!trimmed.includes(':')) {
    const n = parseInt(trimmed, 10)
    return Number.isInteger(n) && n >= 0 ? n : null
  }
  const [m, s] = trimmed.split(':')
  const mi = parseInt(m, 10)
  const si = parseInt(s, 10)
  if (!Number.isInteger(mi) || mi < 0 || !Number.isInteger(si) || si < 0 || si > 59) return null
  return mi * 60 + si
}

function formatMmss(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Project the per-movement form state into the API payload shape, using the
// current `selectedMovements` order to assign `displayOrder`. Empty strings
// drop out of the payload (sent as undefined → the API persists null).
function buildMovementsPayload(
  selected: Movement[],
  prescriptions: Record<string, PrescriptionForm>,
) {
  return selected.map((m, i) => {
    const p = prescriptions[m.id] ?? EMPTY_PRESCRIPTION
    const sets     = parseInt(p.sets,     10)
    const load     = parseFloat(p.load)
    const distance = parseFloat(p.distance)
    const calories = parseInt(p.calories, 10)
    const seconds  = parseInt(p.seconds,  10)
    return {
      movementId:   m.id,
      displayOrder: i,
      sets:     Number.isFinite(sets)     && sets     > 0 ? sets : undefined,
      reps:     p.reps  ? p.reps  : undefined,
      load:     Number.isFinite(load)     && load     > 0 ? load : undefined,
      loadUnit: p.load  ? p.loadUnit : undefined,
      tracksLoad: p.tracksLoad,
      tempo:    p.tempo ? p.tempo : undefined,
      distance:     Number.isFinite(distance) && distance > 0 ? distance : undefined,
      distanceUnit: p.distance ? p.distanceUnit : undefined,
      calories: Number.isFinite(calories) && calories >= 0 ? calories : undefined,
      seconds:  Number.isFinite(seconds)  && seconds  >= 0 ? seconds  : undefined,
    }
  })
}

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
  /**
   * Routes program/workout list + create/update/delete through the active
   * scope (gym vs admin). Gym callers build it from `useGym()` via
   * `makeGymProgramScope`; admin callers pass `adminProgramScope`. The
   * drawer only sees the interface, not the gym/admin specifics.
   */
  scope: ProgramScope
  dateKey: string | null
  workout?: Workout
  workoutsOnDay?: Workout[]
  userGymRole?: Role | null
  /**
   * Pre-selects this program in the picker when the drawer opens in create
   * mode. Used by Calendar's `?programId` filter so a workout created from a
   * filtered view is auto-tagged to that program. For admin, the parent
   * page (`AdminProgramDetail`) passes the current program id so the picker
   * is locked to the program being edited.
   */
  defaultProgramId?: string
  onClose: () => void
  onSaved: () => void
  onAutoSaved?: () => void
  onReordered?: () => void
  onWorkoutSelect?: (id: string) => void
  onNewWorkout?: () => void
}

function buildSnapshot(args: {
  title: string
  description: string
  coachNotes: string
  type: WorkoutType
  namedWorkoutId: string | null
  movementIds: string[]
  programId: string | null
  prescriptions: Record<string, PrescriptionForm>
  timeCapSeconds: string
  tracksRounds: boolean
}): string {
  // Project prescriptions in movement-id order so equal sets compare equal.
  const prescriptionsCanonical = args.movementIds.map((id) => [id, args.prescriptions[id] ?? EMPTY_PRESCRIPTION])
  return JSON.stringify({
    title: args.title.trim(),
    description: args.description,
    coachNotes: args.coachNotes,
    type: args.type,
    namedWorkoutId: args.namedWorkoutId,
    movementIds: args.movementIds,
    programId: args.programId,
    prescriptions: prescriptionsCanonical,
    timeCapSeconds: args.timeCapSeconds.trim(),
    tracksRounds: args.tracksRounds,
  })
}

export default function WorkoutDrawer({ scope, dateKey, workout, workoutsOnDay = [], userGymRole, defaultProgramId, onClose, onSaved, onAutoSaved, onReordered, onWorkoutSelect, onNewWorkout }: WorkoutDrawerProps) {
  const isOpen = dateKey !== null
  // The day-context affordances (workoutsOnDay nav, dayOrder reorder, draft
  // autosave + publish-from-draft toggle) only make sense in the gym
  // calendar surface. Admin curates one workout at a time inside a program
  // and auto-publishes on create.
  const isGymScope = scope.kind === 'gym'

  const allMovements = useMovements()
  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(false)
  const [programId, setProgramId] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WorkoutType>('AMRAP')
  const [description, setDescription] = useState('')
  const [coachNotes, setCoachNotes] = useState('')
  const [namedWorkouts, setNamedWorkouts] = useState<NamedWorkout[]>([])
  const [namedWorkoutId, setNamedWorkoutId] = useState<string | null>(null)
  const [selectedMovements, setSelectedMovements] = useState<Movement[]>([])
  const [suggestedMovementIds, setSuggestedMovementIds] = useState<string[]>([])
  const [prescriptions, setPrescriptions] = useState<Record<string, PrescriptionForm>>({})
  const [timeCapInput, setTimeCapInput] = useState<string>('')
  const [tracksRounds, setTracksRounds] = useState<boolean>(false)
  const [showAllColumns, setShowAllColumns] = useState<boolean>(false)
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
    scope.list()
      .then((list) => {
        setPrograms(list)
        setProgramId((prev) => prev || defaultProgramId || list[0]?.id || '')
      })
      .catch(() => setError('Failed to load programs'))
      .finally(() => setProgramsLoading(false))
  }, [isOpen, isEdit, scope, defaultProgramId])

  useEffect(() => {
    if (!isOpen) return
    setTitle(workout?.title ?? '')
    setType(workout?.type ?? 'AMRAP')
    setDescription(workout?.description ?? '')
    setCoachNotes(workout?.coachNotes ?? '')
    setProgramId(workout?.programId ?? defaultProgramId ?? '')
    setNamedWorkoutId(workout?.namedWorkoutId ?? null)
    setSelectedMovements(workout?.workoutMovements?.map((wm) => wm.movement) ?? [])
    // Seed prescriptions from the workout's existing per-movement rows. Empty
    // strings (rather than undefined) so the inputs render controlled.
    const seededPrescriptions: Record<string, PrescriptionForm> = {}
    for (const wm of workout?.workoutMovements ?? []) {
      seededPrescriptions[wm.movement.id] = {
        sets:         wm.sets         !== null && wm.sets         !== undefined ? String(wm.sets) : '',
        reps:         wm.reps         ?? '',
        load:         wm.load         !== null && wm.load         !== undefined ? String(wm.load) : '',
        loadUnit:     wm.loadUnit     ?? 'LB',
        // tracksLoad is always populated on read (Prisma column has @default(true)).
        // The `?? true` covers tests/fixtures that omit the field.
        tracksLoad:   wm.tracksLoad   ?? true,
        tempo:        wm.tempo        ?? '',
        distance:     wm.distance     !== null && wm.distance     !== undefined ? String(wm.distance) : '',
        distanceUnit: wm.distanceUnit ?? 'M',
        calories:     wm.calories     !== null && wm.calories     !== undefined ? String(wm.calories) : '',
        seconds:      wm.seconds      !== null && wm.seconds      !== undefined ? String(wm.seconds) : '',
      }
    }
    setPrescriptions(seededPrescriptions)
    setTimeCapInput(formatMmss(workout?.timeCapSeconds ?? null))
    setTracksRounds(workout?.tracksRounds ?? false)
    setShowAllColumns(false)
    setDismissedIds(new Set())
    setSuggestedMovementIds([])
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
      coachNotes: workout?.coachNotes ?? '',
      type: workout?.type ?? 'AMRAP',
      namedWorkoutId: workout?.namedWorkoutId ?? null,
      movementIds: workout?.workoutMovements?.map((wm) => wm.movement.id) ?? [],
      programId: workout?.id ? null : (workout?.programId ?? defaultProgramId ?? ''),
      prescriptions: seededPrescriptions,
      timeCapSeconds: formatMmss(workout?.timeCapSeconds ?? null),
      tracksRounds: workout?.tracksRounds ?? false,
    })
  }, [isOpen, workout?.id, defaultProgramId])

  // programId is part of the snapshot only while the workout is still being created.
  // Once it exists server-side, the program is immutable, so further edits to the
  // dropdown must not flag a "change" that would re-trigger autosave.
  const snapshot = buildSnapshot({
    title,
    description,
    coachNotes,
    type,
    namedWorkoutId,
    movementIds: selectedMovements.map((m) => m.id),
    programId: localWorkoutId ? null : programId,
    prescriptions,
    timeCapSeconds: timeCapInput,
    tracksRounds,
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
    const movements = buildMovementsPayload(selectedMovements, prescriptions)
    const timeCapSeconds = parseMmss(timeCapInput)
    const tracksRoundsForType = type === 'AMRAP' ? tracksRounds : false
    // `CreateWorkoutSchema.timeCapSeconds` is `z.number().int().positive()` —
    // not nullable. Omit the field on create when there's no cap; on update
    // we always pass the value (the API schema accepts null there to clear).
    const timeCapForCreate = timeCapSeconds !== null ? { timeCapSeconds } : {}

    const task = (async () => {
      setAutosaving(true)
      try {
        if (localWorkoutId) {
          await scope.updateWorkout(localWorkoutId, {
            title: title.trim(),
            description,
            // Empty string clears the field — API normalizes "" → null.
            coachNotes,
            type,
            movements,
            namedWorkoutId,
            timeCapSeconds,
            tracksRounds: tracksRoundsForType,
          })
          lastAutosaveSnapshotRef.current = snapshotAtSave
        } else {
          const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
          const created = await scope.createWorkout(programId, {
            title: title.trim(),
            description,
            // Only attach coachNotes if the user typed something — keeps the
            // create payload tidy for workouts authored without notes.
            ...(coachNotes ? { coachNotes } : {}),
            type,
            scheduledAt,
            movements,
            namedWorkoutId: namedWorkoutId ?? undefined,
            ...timeCapForCreate,
            tracksRounds: tracksRoundsForType,
          })
          setLocalWorkoutId(created.id)
          setLocalStatus(created.status)
          // After create, programId drops out of future snapshots — store the
          // post-create shape so the next render doesn't look dirty.
          lastAutosaveSnapshotRef.current = buildSnapshot({
            title,
            description,
            coachNotes,
            type,
            namedWorkoutId,
            movementIds: selectedMovements.map((m) => m.id),
            programId: null,
            prescriptions,
            timeCapSeconds: timeCapInput,
            tracksRounds,
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

  // Auto-detect movements from description (debounced 800ms). Detection
  // produces suggestions, not auto-tags — the programmer accepts each one
  // explicitly via the pill ✓ / ✗ controls below the prescription rows.
  useEffect(() => {
    if (!isOpen || !description.trim() || allMovements.length === 0) return
    const timer = setTimeout(() => {
      setDetectLoading(true)
      api.movements.detect(description)
        .then((detected) => {
          const selectedIds = new Set(selectedMovements.map((m) => m.id))
          const fresh = detected
            .filter((m) => !selectedIds.has(m.id) && !dismissedIds.has(m.id))
            .map((m) => m.id)
          setSuggestedMovementIds(fresh)
        })
        .catch(() => {})
        .finally(() => setDetectLoading(false))
    }, 800)
    return () => clearTimeout(timer)
    // selectedMovements + dismissedIds intentionally omitted — captured at
    // setup time, refreshed on the next description change. Avoids re-firing
    // the detect API on every accept/dismiss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, isOpen, allMovements.length])

  function acceptSuggestion(id: string) {
    const movement = allMovements.find((m) => m.id === id)
    if (!movement) return
    setSelectedMovements((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, movement]))
    setSuggestedMovementIds((prev) => prev.filter((sid) => sid !== id))
  }

  function dismissSuggestion(id: string) {
    setDismissedIds((prev) => new Set(prev).add(id))
    setSuggestedMovementIds((prev) => prev.filter((sid) => sid !== id))
  }

  function handleApplyTemplate() {
    const nw = namedWorkouts.find((n) => n.id === namedWorkoutId)
    if (!nw?.templateWorkout) return
    setTitle(nw.name)
    setType(nw.templateWorkout.type)
    setDescription(nw.templateWorkout.description)
    setSelectedMovements(nw.templateWorkout.workoutMovements?.map((wm) => wm.movement) ?? [])
    setDismissedIds(new Set())
    setSuggestedMovementIds([])
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
      const movements = buildMovementsPayload(selectedMovements, prescriptions)
      const timeCapSeconds = parseMmss(timeCapInput)
      const tracksRoundsForType = type === 'AMRAP' ? tracksRounds : false
      const timeCapForCreate = timeCapSeconds !== null ? { timeCapSeconds } : {}
      if (localWorkoutId) {
        await scope.updateWorkout(localWorkoutId, { title: title.trim(), description, coachNotes, type, movements, namedWorkoutId, timeCapSeconds, tracksRounds: tracksRoundsForType })
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        await scope.createWorkout(programId, { title: title.trim(), description, ...(coachNotes ? { coachNotes } : {}), type, scheduledAt, movements, namedWorkoutId: namedWorkoutId ?? undefined, ...timeCapForCreate, tracksRounds: tracksRoundsForType })
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
      const movements = buildMovementsPayload(selectedMovements, prescriptions)
      const timeCapSeconds = parseMmss(timeCapInput)
      const tracksRoundsForType = type === 'AMRAP' ? tracksRounds : false
      const timeCapForCreate = timeCapSeconds !== null ? { timeCapSeconds } : {}
      let id = localWorkoutId
      if (id) {
        await scope.updateWorkout(id, { title: title.trim(), description, coachNotes, type, movements, namedWorkoutId, timeCapSeconds, tracksRounds: tracksRoundsForType })
      } else {
        const scheduledAt = new Date(dateKey! + 'T12:00:00').toISOString()
        const created = await scope.createWorkout(programId, { title: title.trim(), description, ...(coachNotes ? { coachNotes } : {}), type, scheduledAt, movements, namedWorkoutId: namedWorkoutId ?? undefined, ...timeCapForCreate, tracksRounds: tracksRoundsForType })
        id = created.id
      }
      // Publish is gym-only — admin workouts are auto-PUBLISHED on create.
      // Hidden in the UI when scope.kind !== 'gym', so this branch is
      // unreachable in admin mode; the guard is belt-and-suspenders.
      if (isGymScope) await api.workouts.publish(id!)
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
      await scope.deleteWorkout(localWorkoutId)
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
        scope.updateWorkout(current.id, { dayOrder: target.dayOrder }),
        scope.updateWorkout(target.id, { dayOrder: current.dayOrder }),
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
    programs.find((p) => p.id === programId)?.name ??
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
                    onClick={() => onWorkoutSelect?.(w.id)}
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
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
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

          {TIME_CAP_TYPES.has(type) && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="wd-time-cap" className="block text-xs text-gray-400 mb-1">
                  Time cap <span className="text-gray-500">(M:SS)</span>
                </label>
                <input
                  id="wd-time-cap"
                  type="text"
                  value={timeCapInput}
                  onChange={(e) => setTimeCapInput(e.target.value)}
                  placeholder="20:00"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              {type === 'AMRAP' && (
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer min-h-7 select-none">
                    <input
                      type="checkbox"
                      checked={tracksRounds}
                      onChange={(e) => setTracksRounds(e.target.checked)}
                      className="w-4 h-4 rounded accent-indigo-500"
                    />
                    <span className="text-sm text-gray-300">Track rounds</span>
                  </label>
                </div>
              )}
            </div>
          )}

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

          {/*
            Coach notes — programmer-authored stimulus / teaching points (#184).
            Visible to all editors of this drawer (same gate as description, since
            the drawer itself only opens for programmers/owners). Markdown is
            rendered on the read side via MarkdownDescription; here it's a plain
            textarea matching the description-authoring shape.
          */}
          <div>
            <label htmlFor="wd-coach-notes" className="block text-xs text-gray-400 mb-1">
              Coach notes (stimulus, teaching points)
              <span className="ml-1 text-gray-400">(optional, supports markdown)</span>
            </label>
            <textarea
              id="wd-coach-notes"
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Stimulus, scaling guidance, teaching cues…"
              rows={4}
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
                  <div className="space-y-2 mb-2">
                    {selectedMovements.map((m) => (
                      <PrescriptionRow
                        key={m.id}
                        movement={m}
                        type={type}
                        prescription={prescriptions[m.id] ?? blankPrescription()}
                        showAllColumns={showAllColumns}
                        onChange={(next) =>
                          setPrescriptions((prev) => ({ ...prev, [m.id]: next }))
                        }
                        onRemove={() => {
                          setSelectedMovements((prev) => prev.filter((x) => x.id !== m.id))
                          setPrescriptions((prev) => {
                            const { [m.id]: _, ...rest } = prev
                            return rest
                          })
                          setDismissedIds((prev) => new Set([...prev, m.id]))
                        }}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowAllColumns((v) => !v)}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      {showAllColumns ? '− Hide unused columns' : '+ Show all columns'}
                    </button>
                  </div>
                )}

                {suggestedMovementIds.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5" data-testid="movement-suggestions">
                    {suggestedMovementIds.map((id) => {
                      const m = allMovements.find((x) => x.id === id)
                      if (!m) return null
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-0.5 pl-2.5 pr-0.5 py-0.5 rounded-full text-xs bg-indigo-900/40 border border-indigo-700/40 text-indigo-200"
                        >
                          <span className="mr-1">{m.name}</span>
                          <button
                            type="button"
                            onClick={() => acceptSuggestion(id)}
                            aria-label={`Add ${m.name}`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissSuggestion(id)}
                            aria-label={`Dismiss ${m.name}`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-rose-400 hover:bg-rose-500/20 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900"
                          >
                            ✗
                          </button>
                        </span>
                      )
                    })}
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
              {/*
                * Admin path has no draft/staging concept (catalog content is
                * always live), so the footer collapses to a single Save
                * button that publishes immediately. Gym keeps the original
                * Draft/Publish split flow.
                */}
              {!isGymScope ? (
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="w-full bg-indigo-700 hover:bg-indigo-600 text-white text-sm py-2 rounded transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              ) : (
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
              )}
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

// ─── Per-movement prescription row ─────────────────────────────────────────────

interface PrescriptionRowProps {
  movement: Movement
  type: WorkoutType
  prescription: PrescriptionForm
  showAllColumns: boolean
  onChange: (next: PrescriptionForm) => void
  onRemove: () => void
}

const COLUMN_DEFS: { key: keyof PrescriptionForm; label: string; placeholder: string; inputMode?: 'numeric' | 'decimal' | 'text' }[] = [
  { key: 'sets',     label: 'Sets',     placeholder: '5',       inputMode: 'numeric' },
  { key: 'reps',     label: 'Reps',     placeholder: '5/1.1.1', inputMode: 'text' },
  { key: 'load',     label: 'Load',     placeholder: '225',     inputMode: 'decimal' },
  { key: 'tempo',    label: 'Tempo',    placeholder: '3.1.1.0', inputMode: 'text' },
  { key: 'distance', label: 'Distance', placeholder: '500',     inputMode: 'decimal' },
  { key: 'calories', label: 'Cals',     placeholder: '20',      inputMode: 'numeric' },
  { key: 'seconds',  label: 'Seconds',  placeholder: '60',      inputMode: 'numeric' },
]

function PrescriptionRow({ movement, type, prescription, showAllColumns, onChange, onRemove }: PrescriptionRowProps) {
  const defaults = defaultPrescriptionColumns(type)
  const available = availablePrescriptionColumns(type)
  // Surface a column when (a) it's reachable for this type AND (b) the
  // type's defaults include it, the user typed a value into it, or the
  // global "show all" toggle is on. Strength's `available` excludes `load`
  // so the column never appears regardless of the toggle.
  const visible = COLUMN_DEFS.filter((c) =>
    available.has(c.key) && (showAllColumns || defaults.has(c.key) || prescription[c.key] !== ''),
  )

  // The Load tracking toggle is meaningful only for categories where the
  // result form surfaces a Load column. MonoStructural doesn't, so the
  // toggle would be a no-op there; hide it.
  const category = WORKOUT_TYPE_STYLES[type].category
  const showLoadToggle = category !== 'MonoStructural'

  function update<K extends keyof PrescriptionForm>(key: K, value: PrescriptionForm[K]) {
    onChange({ ...prescription, [key]: value })
  }

  return (
    <div className="border border-gray-800 rounded-md bg-gray-800/30 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-200">{movement.name}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${movement.name}`}
          className="text-gray-500 hover:text-red-400 -my-1 -mr-1.5 w-7 h-7 inline-flex items-center justify-center transition-colors"
        >
          ×
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {visible.map((c) => (
          <PrescriptionInput
            key={c.key}
            id={`pr-${movement.id}-${c.key}`}
            field={c.key}
            label={c.label}
            placeholder={c.placeholder}
            inputMode={c.inputMode}
            prescription={prescription}
            onUpdate={update}
          />
        ))}
      </div>
      {showLoadToggle && (
        <label
          htmlFor={`pr-${movement.id}-tracksLoad`}
          className="flex items-center gap-2 mt-2 text-xs text-gray-400 cursor-pointer min-h-7 select-none"
        >
          <input
            id={`pr-${movement.id}-tracksLoad`}
            type="checkbox"
            checked={prescription.tracksLoad}
            onChange={(e) => update('tracksLoad', e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-500"
          />
          <span>Track load on results</span>
        </label>
      )}
    </div>
  )
}

function PrescriptionInput({
  id,
  field,
  label,
  placeholder,
  inputMode,
  prescription,
  onUpdate,
}: {
  id: string
  field: keyof PrescriptionForm
  label: string
  placeholder: string
  inputMode?: 'numeric' | 'decimal' | 'text'
  prescription: PrescriptionForm
  onUpdate: <K extends keyof PrescriptionForm>(key: K, value: PrescriptionForm[K]) => void
}) {
  // Load and Distance carry a unit picker beside the value input. Other
  // columns are plain text/number inputs. Wrapping the unit picker into the
  // same primitive keeps the grid alignment uniform.
  const unitField =
    field === 'load' ? 'loadUnit' :
    field === 'distance' ? 'distanceUnit' :
    null

  return (
    <div>
      <label htmlFor={id} className="block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</label>
      <div className={unitField ? 'flex gap-1' : ''}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          value={prescription[field] as string}
          onChange={(e) => onUpdate(field, e.target.value as PrescriptionForm[typeof field])}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        {unitField === 'loadUnit' && (
          <select
            aria-label={`Load unit for ${label}`}
            value={prescription.loadUnit}
            onChange={(e) => onUpdate('loadUnit', e.target.value as LoadUnit)}
            className="bg-gray-900 border border-gray-700 rounded px-1 text-xs text-white"
          >
            <option value="LB">lb</option>
            <option value="KG">kg</option>
          </select>
        )}
        {unitField === 'distanceUnit' && (
          <select
            aria-label={`Distance unit for ${label}`}
            value={prescription.distanceUnit}
            onChange={(e) => onUpdate('distanceUnit', e.target.value as DistanceUnit)}
            className="bg-gray-900 border border-gray-700 rounded px-1 text-xs text-white"
          >
            <option value="M">m</option>
            <option value="KM">km</option>
            <option value="MI">mi</option>
            <option value="FT">ft</option>
            <option value="YD">yd</option>
          </select>
        )}
      </div>
    </div>
  )
}
