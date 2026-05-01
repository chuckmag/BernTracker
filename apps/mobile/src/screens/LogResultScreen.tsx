import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import {
  api,
  deriveWorkoutGender,
  type DistanceUnit,
  type LoadUnit,
  type Workout,
  type WorkoutLevel,
  type WorkoutMovementWithPrescription,
  type WorkoutType,
  type ResultValue,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'

type Props = StackScreenProps<RootStackParamList, 'LogResult'>

const LEVELS: { value: WorkoutLevel; label: string }[] = [
  { value: 'RX_PLUS', label: 'RX+' },
  { value: 'RX', label: 'RX' },
  { value: 'SCALED', label: 'Scaled' },
  { value: 'MODIFIED', label: 'Modified' },
]

const REPS_REGEX = /^\d+(\.\d+)*$/         // "10" or cluster "1.1.1"
const TEMPO_REGEX = /^[\dxX](\.[\dxX]){3}$/ // "3.1.1.0" or "x.0.x.0"

// ─── Logging mode ───────────────────────────────────────────────────────────
// Strength workouts log per-movement sets tables. Metcons / MonoStructural
// log a single workout-level score. Skill / Warmup default to notes-only.

type LoggingMode = 'sets' | 'score' | 'notes-only'
type ScoreKind = 'ROUNDS_REPS' | 'TIME' | 'DISTANCE' | 'CALORIES'

type WorkoutCategory = 'Strength' | 'Metcon' | 'MonoStructural' | 'Skill Work' | 'Warmup/Recovery'

const TYPE_CATEGORY: Record<WorkoutType, WorkoutCategory> = {
  STRENGTH: 'Strength', POWER_LIFTING: 'Strength', WEIGHT_LIFTING: 'Strength', BODY_BUILDING: 'Strength', MAX_EFFORT: 'Strength',
  AMRAP: 'Metcon', FOR_TIME: 'Metcon', EMOM: 'Metcon', METCON: 'Metcon', TABATA: 'Metcon', INTERVALS: 'Metcon', CHIPPER: 'Metcon', LADDER: 'Metcon', DEATH_BY: 'Metcon',
  CARDIO: 'MonoStructural', RUNNING: 'MonoStructural', ROWING: 'MonoStructural', BIKING: 'MonoStructural', SWIMMING: 'MonoStructural', SKI_ERG: 'MonoStructural', MIXED_MONO: 'MonoStructural',
  GYMNASTICS: 'Skill Work', WEIGHTLIFTING_TECHNIQUE: 'Skill Work',
  WARMUP: 'Warmup/Recovery', MOBILITY: 'Warmup/Recovery', COOLDOWN: 'Warmup/Recovery',
}

function loggingModeFor(workout: Workout): LoggingMode {
  const category = TYPE_CATEGORY[workout.type]
  if (category === 'Strength') return 'sets'
  if (category === 'Metcon') return 'score'
  if (category === 'MonoStructural') return 'score'
  if (category === 'Skill Work') {
    return (workout.workoutMovements?.length ?? 0) > 0 ? 'sets' : 'notes-only'
  }
  return 'notes-only'
}

function scoreKindFor(workout: Workout): ScoreKind {
  if (workout.type === 'AMRAP') return 'ROUNDS_REPS'
  if (TYPE_CATEGORY[workout.type] === 'Metcon') return 'TIME'
  // MonoStructural — distance / cal / time all valid; pick by which
  // prescription the programmer filled in. Default to TIME.
  const wm = workout.workoutMovements?.[0]
  if (wm?.distance !== null && wm?.distance !== undefined) return 'DISTANCE'
  if (wm?.calories !== null && wm?.calories !== undefined) return 'CALORIES'
  return 'TIME'
}

// ─── Set-row state ──────────────────────────────────────────────────────────
// Strings everywhere so partial / empty inputs are first-class. Coerced to
// numbers at submit time.

interface SetRow {
  reps: string
  load: string
  tempo: string
  distance: string
  calories: string
  seconds: string
}

interface MovementSection {
  workoutMovementId: string
  movementName: string
  loadUnit: LoadUnit
  distanceUnit: DistanceUnit
  sets: SetRow[]
}

const EMPTY_SET: SetRow = { reps: '', load: '', tempo: '', distance: '', calories: '', seconds: '' }

function blankSet(): SetRow {
  return { ...EMPTY_SET }
}

// Seed `n` blank set rows, optionally pre-filled with the prescription
// (so the member only edits what differs from the prescription).
function seedSets(prescribed: WorkoutMovementWithPrescription, count: number): SetRow[] {
  const seed: SetRow = {
    reps:     prescribed.reps ?? '',
    load:     prescribed.load !== null ? String(prescribed.load) : '',
    tempo:    prescribed.tempo ?? '',
    distance: prescribed.distance !== null ? String(prescribed.distance) : '',
    calories: prescribed.calories !== null ? String(prescribed.calories) : '',
    seconds:  prescribed.seconds !== null ? String(prescribed.seconds) : '',
  }
  return Array.from({ length: count }, () => ({ ...seed }))
}

function initialMovementSections(workout: Workout, existing?: ResultValue): MovementSection[] {
  const ordered = [...(workout.workoutMovements ?? [])].sort((a, b) => a.displayOrder - b.displayOrder)
  const existingByWmId = new Map<string, { loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets?: Partial<SetRow>[] }>()
  if (existing?.movementResults) {
    for (const mr of existing.movementResults) {
      existingByWmId.set(mr.workoutMovementId, {
        loadUnit: mr.loadUnit as LoadUnit | undefined,
        distanceUnit: mr.distanceUnit as DistanceUnit | undefined,
        sets: mr.sets?.map((s) => ({
          reps:     s.reps !== undefined ? String(s.reps) : '',
          load:     s.load !== undefined ? String(s.load) : '',
          tempo:    s.tempo !== undefined ? String(s.tempo) : '',
          distance: s.distance !== undefined ? String(s.distance) : '',
          calories: s.calories !== undefined ? String(s.calories) : '',
          seconds:  s.seconds !== undefined ? String(s.seconds) : '',
        })),
      })
    }
  }
  return ordered.map((wm) => {
    const prior = existingByWmId.get(wm.movement.id)
    const setCount = prior?.sets?.length ?? wm.sets ?? 1
    const seeded = seedSets(wm, setCount)
    const sets = prior?.sets
      ? prior.sets.map((s, i) => ({ ...seeded[i], ...s } as SetRow))
      : seeded
    return {
      workoutMovementId: wm.movement.id,
      movementName: wm.movement.name,
      loadUnit: prior?.loadUnit ?? wm.loadUnit ?? 'LB',
      distanceUnit: prior?.distanceUnit ?? wm.distanceUnit ?? 'M',
      sets,
    }
  })
}

// ─── Score field state ──────────────────────────────────────────────────────

interface ScoreFieldState {
  rounds: string
  reps: string
  minutes: string
  seconds: string
  cappedOut: boolean
  distance: string
  distanceUnit: DistanceUnit
  calories: string
}

function initialScoreFields(workout: Workout, existing: ResultValue | undefined): ScoreFieldState {
  const score = existing?.score
  const totalSec = score?.kind === 'TIME' ? score.seconds ?? 0 : 0
  const distUnit = score?.kind === 'DISTANCE' ? (score.unit as DistanceUnit | undefined) : undefined
  return {
    rounds:    score?.kind === 'ROUNDS_REPS' && score.rounds != null ? String(score.rounds) : '',
    reps:      score?.kind === 'ROUNDS_REPS' && score.reps != null ? String(score.reps) : '',
    minutes:   score?.kind === 'TIME' ? String(Math.floor(totalSec / 60)) : '',
    seconds:   score?.kind === 'TIME' ? String(totalSec % 60) : '',
    cappedOut: score?.kind === 'TIME' || score?.kind === 'ROUNDS_REPS' ? Boolean(score.cappedOut) : false,
    distance:  score?.kind === 'DISTANCE' && score.distance != null ? String(score.distance) : '',
    distanceUnit: distUnit ?? workout.workoutMovements?.[0]?.distanceUnit ?? 'M',
    calories:  score?.kind === 'CALORIES' && score.calories != null ? String(score.calories) : '',
  }
}

// ─── Build helpers ─────────────────────────────────────────────────────────

type BuildResult<T> = { ok: true } & T | { ok: false; error: string }

function buildScore(kind: ScoreKind, f: ScoreFieldState): BuildResult<{ score: Record<string, unknown> }> {
  if (kind === 'ROUNDS_REPS') {
    const r = parseInt(f.rounds || '0', 10)
    const rp = parseInt(f.reps || '0', 10)
    if (!Number.isInteger(r) || r < 0) return { ok: false, error: 'Rounds must be a non-negative whole number.' }
    if (!Number.isInteger(rp) || rp < 0) return { ok: false, error: 'Reps must be a non-negative whole number.' }
    return { ok: true, score: { kind: 'ROUNDS_REPS', rounds: r, reps: rp, cappedOut: false } }
  }
  if (kind === 'TIME') {
    const m = parseInt(f.minutes || '0', 10)
    const s = parseInt(f.seconds || '0', 10)
    if (!Number.isInteger(m) || m < 0) return { ok: false, error: 'Minutes must be a non-negative whole number.' }
    if (!Number.isInteger(s) || s < 0 || s > 59) return { ok: false, error: 'Seconds must be 0–59.' }
    const total = m * 60 + s
    if (total <= 0 && !f.cappedOut) return { ok: false, error: 'Enter a time, or mark the result as capped.' }
    return { ok: true, score: { kind: 'TIME', seconds: total, cappedOut: f.cappedOut } }
  }
  if (kind === 'DISTANCE') {
    const d = parseFloat(f.distance)
    if (!isFinite(d) || d <= 0) return { ok: false, error: 'Enter a positive distance.' }
    return { ok: true, score: { kind: 'DISTANCE', distance: d, unit: f.distanceUnit } }
  }
  // CALORIES
  const c = parseInt(f.calories || '0', 10)
  if (!Number.isInteger(c) || c < 0) return { ok: false, error: 'Calories must be a non-negative whole number.' }
  return { ok: true, score: { kind: 'CALORIES', calories: c } }
}

function buildMovementResults(movements: MovementSection[]): BuildResult<{
  results: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[]
}> {
  const out: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[] = []
  for (const m of movements) {
    const sets: Record<string, unknown>[] = []
    let hasLoad = false, hasDistance = false
    for (let i = 0; i < m.sets.length; i++) {
      const s = m.sets[i]
      const set: Record<string, unknown> = {}
      if (s.reps) {
        if (!REPS_REGEX.test(s.reps)) return { ok: false, error: `${m.movementName} set ${i + 1}: reps must be digits, e.g. "5" or cluster "1.1.1".` }
        set.reps = s.reps
      }
      if (s.load) {
        const v = parseFloat(s.load)
        if (!isFinite(v) || v <= 0) return { ok: false, error: `${m.movementName} set ${i + 1}: load must be positive.` }
        set.load = v; hasLoad = true
      }
      if (s.tempo) {
        if (!TEMPO_REGEX.test(s.tempo)) return { ok: false, error: `${m.movementName} set ${i + 1}: tempo must be four dot-separated values, e.g. "3.1.1.0".` }
        set.tempo = s.tempo
      }
      if (s.distance) {
        const v = parseFloat(s.distance)
        if (!isFinite(v) || v <= 0) return { ok: false, error: `${m.movementName} set ${i + 1}: distance must be positive.` }
        set.distance = v; hasDistance = true
      }
      if (s.calories) {
        const v = parseInt(s.calories, 10)
        if (!Number.isInteger(v) || v < 0) return { ok: false, error: `${m.movementName} set ${i + 1}: calories must be a non-negative integer.` }
        set.calories = v
      }
      if (s.seconds) {
        const v = parseInt(s.seconds, 10)
        if (!Number.isInteger(v) || v < 0) return { ok: false, error: `${m.movementName} set ${i + 1}: seconds must be a non-negative integer.` }
        set.seconds = v
      }
      if (Object.keys(set).length === 0) continue
      sets.push(set)
    }
    if (sets.length === 0) continue
    out.push({
      workoutMovementId: m.workoutMovementId,
      ...(hasLoad ? { loadUnit: m.loadUnit } : {}),
      ...(hasDistance ? { distanceUnit: m.distanceUnit } : {}),
      sets,
    })
  }
  return { ok: true, results: out }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function LogResultScreen({ route, navigation }: Props) {
  const { workoutId, resultId, existingResult } = route.params
  const { user } = useAuth()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loadingWorkout, setLoadingWorkout] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyLogged, setAlreadyLogged] = useState(false)

  const [level, setLevel] = useState<WorkoutLevel>(existingResult?.level ?? 'RX')
  const [movements, setMovements] = useState<MovementSection[]>([])
  const [activeMovement, setActiveMovement] = useState(0)
  const [scoreFields, setScoreFields] = useState<ScoreFieldState>({
    rounds: '', reps: '', minutes: '', seconds: '', cappedOut: false,
    distance: '', distanceUnit: 'M', calories: '',
  })
  const [notes, setNotes] = useState(existingResult?.notes ?? '')

  const isEdit = Boolean(resultId && existingResult)

  useEffect(() => {
    let cancelled = false
    api.workouts.get(workoutId)
      .then((w) => {
        if (cancelled) return
        setWorkout(w)
        setMovements(initialMovementSections(w, existingResult?.value))
        setScoreFields(initialScoreFields(w, existingResult?.value))
      })
      .catch(() => { if (!cancelled) setError('Could not load workout.') })
      .finally(() => { if (!cancelled) setLoadingWorkout(false) })
    return () => { cancelled = true }
    // existingResult comes from route params and never changes mid-session;
    // including it here would re-fire the fetch on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  const mode = workout ? loggingModeFor(workout) : 'notes-only'
  const scoreKind = workout ? scoreKindFor(workout) : 'TIME'
  const canLogSets = mode === 'sets' && movements.length > 0

  function buildValue(): { ok: true; value: ResultValue } | { ok: false; error: string } {
    let movementResults: { workoutMovementId: string; loadUnit?: LoadUnit; distanceUnit?: DistanceUnit; sets: Record<string, unknown>[] }[] = []
    if (canLogSets) {
      const built = buildMovementResults(movements)
      if (!built.ok) return built
      movementResults = built.results
    }
    let score: Record<string, unknown> | undefined
    if (mode === 'score') {
      const built = buildScore(scoreKind, scoreFields)
      if (!built.ok) return built
      score = built.score
    }
    if (mode === 'notes-only') {
      // Notes-only types need at least *something* to record, but the
      // schema's refine rejects an empty value. Synthesize a zero-rep score
      // so the row is queryable.
      score = { kind: 'REPS', reps: 0 }
    }
    if (!score && movementResults.length === 0) {
      return { ok: false, error: 'Enter a score or at least one set.' }
    }
    return {
      ok: true,
      value: {
        ...(score ? { score } : {}),
        movementResults,
      } as ResultValue,
    }
  }

  async function handleSubmit() {
    if (!workout) return
    const built = buildValue()
    if (!built.ok) { setError(built.error); return }

    setError(null)
    setAlreadyLogged(false)
    setSubmitting(true)
    try {
      if (isEdit && resultId) {
        await api.results.update(resultId, {
          level,
          value: built.value,
          notes: notes.trim() || null,
        })
      } else {
        const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)
        await api.workouts.logResult(workoutId, {
          level,
          workoutGender,
          value: built.value,
          notes: notes.trim() || undefined,
        })
      }
      navigation.goBack()
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status
      if (status === 409) {
        setAlreadyLogged(true)
      } else {
        setError(e instanceof Error ? e.message : 'Could not save result.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleDelete() {
    if (!resultId) return
    Alert.alert(
      'Delete result?',
      'This will remove your result from the leaderboard.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await api.results.delete(resultId)
              navigation.goBack()
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Could not delete result.')
            } finally {
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  // ── Set-row helpers ──────────────────────────────────────────────────────
  function updateSet(mIdx: number, sIdx: number, field: keyof SetRow, value: string) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      const sets = m.sets.map((s, j) => (j === sIdx ? { ...s, [field]: value } : s))
      return { ...m, sets }
    }))
  }

  function addSet(mIdx: number) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      const last = m.sets[m.sets.length - 1] ?? blankSet()
      // Carry over reps/load/tempo from the last row — most members repeat
      // them set to set, and clearing the cell is faster than retyping.
      return { ...m, sets: [...m.sets, { ...last }] }
    }))
  }

  function removeSet(mIdx: number, sIdx: number) {
    setMovements((prev) => prev.map((m, i) => {
      if (i !== mIdx) return m
      if (m.sets.length <= 1) return m
      return { ...m, sets: m.sets.filter((_, j) => j !== sIdx) }
    }))
  }

  function setMovementUnit(mIdx: number, field: 'loadUnit' | 'distanceUnit', value: LoadUnit | DistanceUnit) {
    setMovements((prev) => prev.map((m, i) => (i === mIdx ? { ...m, [field]: value } : m)))
  }

  if (loadingWorkout) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#818cf8" />
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Workout not found.'}</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.workoutTitle}>{workout.title}</Text>
        <Text style={styles.workoutType}>{workout.type.replace(/_/g, ' ')}</Text>

        {/* Level chips */}
        <Text style={styles.sectionLabel}>LEVEL</Text>
        <View style={styles.chipRow}>
          {LEVELS.map((l) => (
            <TouchableOpacity
              key={l.value}
              style={[styles.chip, level === l.value && styles.chipActive]}
              onPress={() => setLevel(l.value)}
            >
              <Text style={[styles.chipText, level === l.value && styles.chipTextActive]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sets table — Strength + Skill Work with prescription */}
        {canLogSets && movements[activeMovement] && (
          <View style={styles.setsSection}>
            {movements.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabStrip}
                contentContainerStyle={styles.tabStripContent}
              >
                {movements.map((m, i) => (
                  <TouchableOpacity
                    key={m.workoutMovementId}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: i === activeMovement }}
                    onPress={() => setActiveMovement(i)}
                    style={[styles.tabChip, i === activeMovement && styles.tabChipActive]}
                    testID={`movement-tab-${i}`}
                  >
                    <Text style={[styles.tabText, i === activeMovement && styles.tabTextActive]}>
                      {m.movementName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <SetsTableRN
              movement={movements[activeMovement]}
              movementIdx={activeMovement}
              prescription={
                workout.workoutMovements.find((wm) => wm.movement.id === movements[activeMovement].workoutMovementId) ?? null
              }
              onUpdate={updateSet}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onUnitChange={setMovementUnit}
            />
          </View>
        )}

        {/* Workout-level score (Metcon + MonoStructural) */}
        {mode === 'score' && (
          <ScoreFieldsRN
            workout={workout}
            kind={scoreKind}
            fields={scoreFields}
            onChange={setScoreFields}
          />
        )}

        {/* Notes-only fallback */}
        {mode === 'notes-only' && (
          <Text style={styles.helpText}>
            This workout type doesn't have a structured score. Add notes below to record what you did.
          </Text>
        )}

        {/* Notes */}
        <Text style={styles.sectionLabel}>NOTES</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor="#6b7280"
          testID="notes-input"
        />

        {/* Errors */}
        {alreadyLogged && (
          <Text style={styles.error}>You've already logged this workout.</Text>
        )}
        {error && !alreadyLogged && <Text style={styles.error}>{error}</Text>}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (submitting || alreadyLogged) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || alreadyLogged}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitBtnText}>{isEdit ? 'Save changes' : 'Log result'}</Text>
          }
        </TouchableOpacity>

        {/* Delete (edit mode only) */}
        {isEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete result'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── SetsTableRN ─────────────────────────────────────────────────────────────

const ALL_COLUMNS: { key: keyof SetRow; label: string; placeholder: string; numeric: boolean }[] = [
  { key: 'reps',     label: 'Reps',     placeholder: '5 or 1.1.1', numeric: false },
  { key: 'load',     label: 'Load',     placeholder: '225',         numeric: true  },
  { key: 'tempo',    label: 'Tempo',    placeholder: '3.1.1.0',     numeric: false },
  { key: 'distance', label: 'Distance', placeholder: '500',         numeric: true  },
  { key: 'calories', label: 'Cals',     placeholder: '20',          numeric: true  },
  { key: 'seconds',  label: 'Seconds',  placeholder: '60',          numeric: true  },
]

const LOAD_UNITS: { value: LoadUnit; label: string }[] = [
  { value: 'LB', label: 'lb' },
  { value: 'KG', label: 'kg' },
]

const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'M',  label: 'm'  },
  { value: 'KM', label: 'km' },
  { value: 'MI', label: 'mi' },
  { value: 'FT', label: 'ft' },
  { value: 'YD', label: 'yd' },
]

function SetsTableRN({
  movement,
  movementIdx,
  prescription,
  onUpdate,
  onAddSet,
  onRemoveSet,
  onUnitChange,
}: {
  movement: MovementSection
  movementIdx: number
  prescription: WorkoutMovementWithPrescription | null
  onUpdate: (mIdx: number, sIdx: number, field: keyof SetRow, value: string) => void
  onAddSet: (mIdx: number) => void
  onRemoveSet: (mIdx: number, sIdx: number) => void
  onUnitChange: (mIdx: number, field: 'loadUnit' | 'distanceUnit', value: LoadUnit | DistanceUnit) => void
}) {
  // The columns to surface come from whichever fields the programmer
  // prescribed — anything they didn't prescribe is hidden by default.
  // Members can show extras via the "+ Column" buttons below the table.
  const prescribed = useMemo(() => {
    if (!prescription) return new Set<keyof SetRow>(['reps', 'load'])
    const cols = new Set<keyof SetRow>()
    if (prescription.reps !== null)     cols.add('reps')
    if (prescription.load !== null)     cols.add('load')
    if (prescription.tempo !== null)    cols.add('tempo')
    if (prescription.distance !== null) cols.add('distance')
    if (prescription.calories !== null) cols.add('calories')
    if (prescription.seconds !== null)  cols.add('seconds')
    if (cols.size === 0) cols.add('reps').add('load')
    return cols
  }, [prescription])

  // Auto-show a column if the user has typed into any cell of it.
  const visible = useMemo(() => {
    const cols = new Set(prescribed)
    for (const s of movement.sets) {
      ;(['reps', 'load', 'tempo', 'distance', 'calories', 'seconds'] as const).forEach((c) => {
        if (s[c] !== '') cols.add(c)
      })
    }
    return cols
  }, [prescribed, movement.sets])

  const showColumns = ALL_COLUMNS.filter((c) => visible.has(c.key))
  const hiddenColumns = ALL_COLUMNS.filter((c) => !visible.has(c.key))

  return (
    <View>
      {/* Unit pickers — only render when load or distance is in play */}
      {(visible.has('load') || visible.has('distance')) && (
        <View style={styles.unitRow}>
          {visible.has('load') && (
            <View style={styles.unitGroup}>
              <Text style={styles.unitLabel}>Load:</Text>
              <View style={styles.unitChips}>
                {LOAD_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.value}
                    style={[styles.unitChip, movement.loadUnit === u.value && styles.unitChipActive]}
                    onPress={() => onUnitChange(movementIdx, 'loadUnit', u.value)}
                    accessibilityLabel={`Load unit ${u.label}`}
                    testID={`load-unit-${u.value}`}
                  >
                    <Text style={[styles.unitChipText, movement.loadUnit === u.value && styles.unitChipTextActive]}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {visible.has('distance') && (
            <View style={styles.unitGroup}>
              <Text style={styles.unitLabel}>Distance:</Text>
              <View style={styles.unitChips}>
                {DISTANCE_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.value}
                    style={[styles.unitChip, movement.distanceUnit === u.value && styles.unitChipActive]}
                    onPress={() => onUnitChange(movementIdx, 'distanceUnit', u.value)}
                    accessibilityLabel={`Distance unit ${u.label}`}
                    testID={`distance-unit-${u.value}`}
                  >
                    <Text style={[styles.unitChipText, movement.distanceUnit === u.value && styles.unitChipTextActive]}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Header row */}
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.tableHeaderCell, styles.tableSetCol]}>Set</Text>
        {showColumns.map((c) => (
          <Text key={c.key} style={styles.tableHeaderCell}>{c.label}</Text>
        ))}
        <View style={styles.tableRemoveCol} />
      </View>

      {/* Body rows */}
      {movement.sets.map((s, sIdx) => (
        <View key={sIdx} style={styles.tableRow}>
          <Text style={[styles.tableSetIdx, styles.tableSetCol]}>{sIdx + 1}</Text>
          {showColumns.map((c) => (
            <View key={c.key} style={styles.tableCell}>
              <TextInput
                style={styles.tableInput}
                value={s[c.key]}
                onChangeText={(v) => onUpdate(movementIdx, sIdx, c.key, v)}
                placeholder={c.placeholder}
                placeholderTextColor="#4b5563"
                keyboardType={c.numeric ? 'decimal-pad' : 'default'}
                accessibilityLabel={`Set ${sIdx + 1} ${c.label}`}
                testID={`set-${sIdx}-${c.key}`}
              />
            </View>
          ))}
          <View style={styles.tableRemoveCol}>
            {movement.sets.length > 1 && (
              <TouchableOpacity
                onPress={() => onRemoveSet(movementIdx, sIdx)}
                accessibilityLabel={`Remove set ${sIdx + 1}`}
                testID={`remove-set-${sIdx}`}
                style={styles.removeBtn}
              >
                <Text style={styles.removeBtnText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Action buttons */}
      <View style={styles.tableActions}>
        <TouchableOpacity
          style={styles.addSetBtn}
          onPress={() => onAddSet(movementIdx)}
          accessibilityLabel="Add set"
          testID="add-set"
        >
          <Text style={styles.addSetBtnText}>+ Add set</Text>
        </TouchableOpacity>
        {hiddenColumns.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={styles.addColBtn}
            onPress={() => onUpdate(movementIdx, 0, c.key, c.placeholder.split(' ')[0])}
            accessibilityLabel={`Add ${c.label} column`}
            testID={`add-col-${c.key}`}
          >
            <Text style={styles.addColBtnText}>+ {c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// ─── ScoreFieldsRN ───────────────────────────────────────────────────────────

function ScoreFieldsRN({
  workout: _workout,
  kind,
  fields,
  onChange,
}: {
  workout: Workout
  kind: ScoreKind
  fields: ScoreFieldState
  onChange: (next: ScoreFieldState) => void
}) {
  const update = <K extends keyof ScoreFieldState>(field: K, value: ScoreFieldState[K]) =>
    onChange({ ...fields, [field]: value })

  if (kind === 'ROUNDS_REPS') {
    return (
      <View>
        <Text style={styles.sectionLabel}>SCORE</Text>
        <View style={styles.inlineInputs}>
          {_workout.tracksRounds && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Rounds</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={fields.rounds}
                onChangeText={(v) => update('rounds', v)}
                placeholder="0"
                placeholderTextColor="#6b7280"
                testID="rounds-input"
              />
            </View>
          )}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Reps</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={fields.reps}
              onChangeText={(v) => update('reps', v)}
              placeholder="0"
              placeholderTextColor="#6b7280"
              testID="reps-input"
            />
          </View>
        </View>
      </View>
    )
  }
  if (kind === 'TIME') {
    return (
      <View>
        <Text style={styles.sectionLabel}>TIME</Text>
        <View style={styles.inlineInputs}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Minutes</Text>
            <TextInput
              style={[styles.input, fields.cappedOut && styles.inputDisabled]}
              keyboardType="number-pad"
              value={fields.minutes}
              onChangeText={(v) => update('minutes', v)}
              placeholder="0"
              placeholderTextColor="#6b7280"
              editable={!fields.cappedOut}
              testID="minutes-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Seconds</Text>
            <TextInput
              style={[styles.input, fields.cappedOut && styles.inputDisabled]}
              keyboardType="number-pad"
              value={fields.seconds}
              onChangeText={(v) => update('seconds', v)}
              placeholder="0"
              placeholderTextColor="#6b7280"
              editable={!fields.cappedOut}
              testID="seconds-input"
            />
          </View>
        </View>
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => update('cappedOut', !fields.cappedOut)}
          testID="capped-toggle"
        >
          <View style={[styles.checkbox, fields.cappedOut && styles.checkboxChecked]}>
            {fields.cappedOut && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.toggleLabel}>Time capped (didn't finish)</Text>
        </TouchableOpacity>
      </View>
    )
  }
  if (kind === 'DISTANCE') {
    return (
      <View>
        <Text style={styles.sectionLabel}>DISTANCE</Text>
        <View style={styles.inlineInputs}>
          <View style={[styles.inputGroup, { flex: 2 }]}>
            <Text style={styles.inputLabel}>Distance</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={fields.distance}
              onChangeText={(v) => update('distance', v)}
              placeholder="0"
              placeholderTextColor="#6b7280"
              testID="distance-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Unit</Text>
            <View style={styles.unitChipsCol}>
              {DISTANCE_UNITS.map((u) => (
                <TouchableOpacity
                  key={u.value}
                  style={[styles.unitChip, fields.distanceUnit === u.value && styles.unitChipActive]}
                  onPress={() => update('distanceUnit', u.value)}
                  testID={`score-distance-unit-${u.value}`}
                >
                  <Text style={[styles.unitChipText, fields.distanceUnit === u.value && styles.unitChipTextActive]}>{u.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    )
  }
  // CALORIES
  return (
    <View>
      <Text style={styles.sectionLabel}>CALORIES</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={fields.calories}
        onChangeText={(v) => update('calories', v)}
        placeholder="0"
        placeholderTextColor="#6b7280"
        testID="calories-input"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 48 },
  center: {
    flex: 1,
    backgroundColor: '#030712',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: { fontSize: 22, fontWeight: '700', color: '#ffffff', marginBottom: 4 },
  workoutType: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  helpText: {
    color: '#9ca3af',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 16,
  },
  chipActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  chipText: { color: '#6b7280', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#818cf8', fontWeight: '600' },
  inlineInputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { color: '#9ca3af', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#ffffff',
  },
  inputDisabled: { opacity: 0.4 },
  notesInput: { textAlignVertical: 'top', minHeight: 70 },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  toggleLabel: { color: '#e5e7eb', fontSize: 14 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  submitBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  deleteBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { color: '#f87171', fontSize: 14, fontWeight: '500' },

  // Sets table
  setsSection: { marginTop: 16 },
  tabStrip: { marginBottom: 12 },
  tabStripContent: { gap: 6, paddingRight: 4 },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  tabChipActive: { backgroundColor: '#374151' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#ffffff', fontWeight: '600' },

  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  unitGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unitLabel: { color: '#9ca3af', fontSize: 12 },
  unitChips: { flexDirection: 'row', gap: 4 },
  unitChipsCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  unitChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 6,
  },
  unitChipActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  unitChipText: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
  unitChipTextActive: { color: '#818cf8', fontWeight: '600' },

  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  tableHeaderCell: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  tableSetCol: { flex: 0, width: 28 },
  tableRemoveCol: { width: 32, alignItems: 'flex-end' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  tableSetIdx: { color: '#6b7280', fontSize: 12, paddingRight: 4 },
  tableCell: { flex: 1, paddingHorizontal: 2 },
  tableInput: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    color: '#ffffff',
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#6b7280', fontSize: 18, fontWeight: '600' },
  tableActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  addSetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1f2937',
    borderRadius: 8,
  },
  addSetBtnText: { color: '#e5e7eb', fontSize: 12, fontWeight: '600' },
  addColBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderRadius: 8,
  },
  addColBtnText: { color: '#9ca3af', fontSize: 12, fontWeight: '500' },
})
