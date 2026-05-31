import { useEffect, useMemo, useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Image,
  Platform,
} from 'react-native'
import type { StackScreenProps } from '@react-navigation/stack'
import type { RootStackParamList } from '../../App'
import {
  api,
  deriveWorkoutGender,
  type DistanceUnit,
  type LoadUnit,
  type NewPr,
  type UserWorkoutPlan,
  type Workout,
  type WorkoutLevel,
  type WorkoutMovementWithPrescription,
  type WorkoutType,
  type ResultValue,
} from '../lib/api'
import { useAuth } from '../context/AuthContext'
import MovementTabStrip from '../components/MovementTabStrip'
import { useTheme } from '../lib/theme'
import ThemedText from '../components/ThemedText'
import ThemedView from '../components/ThemedView'

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
  if (workout.type === 'AMRAP' || workout.type === 'INTERVALS') return 'ROUNDS_REPS'
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
  const { colors } = useTheme()
  const { workoutId, resultId, existingResult } = route.params
  const { user } = useAuth()

  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loadingWorkout, setLoadingWorkout] = useState(true)
  const [myPlan, setMyPlan] = useState<UserWorkoutPlan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyLogged, setAlreadyLogged] = useState(false)
  const [prModal, setPrModal] = useState<NewPr[]>([])

  const [level, setLevel] = useState<WorkoutLevel>(existingResult?.level ?? 'RX')
  const [movements, setMovements] = useState<MovementSection[]>([])
  const [activeMovement, setActiveMovement] = useState(0)
  const [scoreFields, setScoreFields] = useState<ScoreFieldState>({
    rounds: '', reps: '', minutes: '', seconds: '', cappedOut: false,
    distance: '', distanceUnit: 'M', calories: '',
  })
  const [notes, setNotes] = useState(existingResult?.notes ?? '')

  const isEdit = Boolean(resultId && existingResult)

  // Tint used for active-chip / checked backgrounds — 20% primary overlay
  // reads as a recessed selection in both light and dark themes.
  const primaryTintBg = `${colors.primary}33`

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

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    api.plans.getForUser(workoutId, user.id)
      .then((p) => { if (!cancelled) setMyPlan(p) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workoutId, user?.id])

  const mode = workout ? loggingModeFor(workout) : 'notes-only'
  const scoreKind = workout ? scoreKindFor(workout) : 'TIME'
  const canLogSets = mode === 'sets' && movements.length > 0

  const planLoadsByMovementId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const mr of myPlan?.value?.movementResults ?? []) {
      map.set(mr.workoutMovementId, mr.sets.map((s) => s.load ?? ''))
    }
    return map
  }, [myPlan])

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
        navigation.goBack()
      } else {
        const workoutGender = deriveWorkoutGender(user?.identifiedGender ?? null)
        const { newPrs } = await api.workouts.logResult(workoutId, {
          level,
          workoutGender,
          value: built.value,
          notes: notes.trim() || undefined,
        })
        if (newPrs.length > 0) {
          setPrModal(newPrs)
        } else {
          navigation.goBack()
        }
      }
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
      <ThemedView variant="screen" style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </ThemedView>
    )
  }

  if (!workout) {
    return (
      <ThemedView variant="screen" style={styles.center}>
        <ThemedText style={[styles.error, { color: colors.errorText }]}>{error ?? 'Workout not found.'}</ThemedText>
      </ThemedView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.screenBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scrollContent, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.workoutTitle}>{workout.title}</ThemedText>
        <ThemedText variant="tertiary" style={styles.workoutType}>{workout.type.replace(/_/g, ' ')}</ThemedText>

        {/* Level chips */}
        <ThemedText variant="tertiary" style={styles.sectionLabel}>LEVEL</ThemedText>
        <View style={styles.chipRow}>
          {LEVELS.map((l) => {
            const isActive = level === l.value
            return (
              <TouchableOpacity
                key={l.value}
                style={[
                  styles.chip,
                  { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                  isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                ]}
                onPress={() => setLevel(l.value)}
              >
                <ThemedText
                  variant="tertiary"
                  style={[styles.chipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                >
                  {l.label}
                </ThemedText>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Sets table — Strength + Skill Work with prescription */}
        {canLogSets && movements[activeMovement] && (
          <View style={styles.setsSection}>
            <MovementTabStrip
              movements={movements}
              active={activeMovement}
              onChange={setActiveMovement}
            />

            <SetsTableRN
              movement={movements[activeMovement]}
              movementIdx={activeMovement}
              category={TYPE_CATEGORY[workout.type]}
              prescription={
                workout.workoutMovements.find((wm) => wm.movement.id === movements[activeMovement].workoutMovementId) ?? null
              }
              planLoadPlaceholders={planLoadsByMovementId.get(movements[activeMovement].workoutMovementId)}
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
          <ThemedText variant="tertiary" style={styles.helpText}>
            This workout type doesn't have a structured score. Add notes below to record what you did.
          </ThemedText>
        )}

        {/* Notes — flex: 1 fills remaining scroll space */}
        <View style={styles.notesSection}>
          <ThemedText variant="tertiary" style={styles.sectionLabel}>NOTES</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.notesInput,
              { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
            ]}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={colors.textPlaceholder}
            testID="notes-input"
          />
        </View>
      </ScrollView>

      {/* Footer — pinned below scroll area so notes can fill remaining space */}
      <View style={[styles.footer, { borderTopColor: colors.borderSubtle, backgroundColor: colors.screenBg }]}>
        {alreadyLogged && (
          <ThemedText style={[styles.error, { color: colors.errorText }]}>You've already logged this workout.</ThemedText>
        )}
        {error && !alreadyLogged && <ThemedText style={[styles.error, { color: colors.errorText }]}>{error}</ThemedText>}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: colors.primary },
            (submitting || alreadyLogged) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting || alreadyLogged}
        >
          {submitting
            ? <ActivityIndicator color={colors.onPrimary} />
            : <ThemedText style={[styles.submitBtnText, { color: colors.onPrimary }]}>{isEdit ? 'Save changes' : 'Log result'}</ThemedText>
          }
        </TouchableOpacity>
        {isEdit && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleting}
          >
            <ThemedText style={[styles.deleteBtnText, { color: colors.errorText }]}>{deleting ? 'Deleting…' : 'Delete result'}</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <PRCelebrationModal
        prs={prModal}
        onDismiss={() => { setPrModal([]); navigation.goBack() }}
      />
    </KeyboardAvoidingView>
  )
}

// ─── PRCelebrationModal ──────────────────────────────────────────────────────

const MASCOT_PR_GIF = { uri: 'https://wodalytics-images-qa.s3.us-east-2.amazonaws.com/pr-celebrations/wodaloBackSquatPr.gif' }

function PRCelebrationModal({ prs, onDismiss }: { prs: NewPr[]; onDismiss: () => void }) {
  const { colors } = useTheme()
  if (prs.length === 0) return null
  const primaryTintBg = `${colors.primary}33`
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={prStyles.overlay}>
        <View style={[prStyles.sheet, { backgroundColor: colors.cardBg }]}>
          <Image source={MASCOT_PR_GIF} style={prStyles.mascot} resizeMode="contain" />
          <ThemedText style={[prStyles.headline, { color: colors.warningText }]}>NEW PR!</ThemedText>
          <ScrollView style={prStyles.prList} contentContainerStyle={prStyles.prListContent}>
            {prs.map((pr) => (
              <View
                key={`${pr.movementId}-${pr.repCount}`}
                style={[prStyles.prCard, { backgroundColor: primaryTintBg, borderColor: colors.primary }]}
              >
                <ThemedText variant="secondary" style={prStyles.movementName}>{pr.movementName}</ThemedText>
                <ThemedText style={[prStyles.prDetail, { color: colors.primary }]}>
                  {pr.repCount} {pr.repCount === 1 ? 'rep' : 'reps'} @ {pr.load} {pr.loadUnit.toLowerCase()}
                </ThemedText>
                {pr.repCount > 1 && (
                  <ThemedText variant="tertiary" style={prStyles.e1rm}>
                    Est. 1RM: {pr.estimatedOneRepMax} {pr.loadUnit.toLowerCase()}
                  </ThemedText>
                )}
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={[prStyles.dismissBtn, { backgroundColor: colors.primary }]} onPress={onDismiss}>
            <ThemedText style={[prStyles.dismissBtnText, { color: colors.onPrimary }]}>Keep crushing it</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const prStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
    maxHeight: '80%',
  },
  mascot: {
    width: '100%',
    height: 200,
    marginBottom: 12,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
  },
  prList: {
    width: '100%',
    maxHeight: 220,
  },
  prListContent: {
    gap: 10,
  },
  prCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  movementName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  prDetail: {
    fontSize: 16,
    fontWeight: '700',
  },
  e1rm: {
    fontSize: 12,
    marginTop: 2,
  },
  dismissBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
})

// ─── SetsTableRN ─────────────────────────────────────────────────────────────

const ALL_COLUMNS: { key: keyof SetRow; label: string; placeholder: string; numeric: boolean }[] = [
  { key: 'reps',     label: 'Reps',     placeholder: '5 or 1.1.1', numeric: true  },
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
  category,
  prescription,
  planLoadPlaceholders,
  onUpdate,
  onAddSet,
  onRemoveSet,
  onUnitChange,
}: {
  movement: MovementSection
  movementIdx: number
  category: WorkoutCategory
  prescription: WorkoutMovementWithPrescription | null
  planLoadPlaceholders?: string[]
  onUpdate: (mIdx: number, sIdx: number, field: keyof SetRow, value: string) => void
  onAddSet: (mIdx: number) => void
  onRemoveSet: (mIdx: number, sIdx: number) => void
  onUnitChange: (mIdx: number, field: 'loadUnit' | 'distanceUnit', value: LoadUnit | DistanceUnit) => void
}) {
  const { colors } = useTheme()
  const primaryTintBg = `${colors.primary}33`

  // The columns to surface come from whichever fields the programmer
  // prescribed — anything they didn't prescribe is hidden by default.
  // Members can show extras via the "+ Column" buttons below the table.
  // Load is special: programmers usually don't prescribe an exact weight
  // (they leave that to the member's training history), so we surface a Load
  // column whenever the prescription's `tracksLoad` flag is true. The flag
  // defaults to true on the API side, so missing-prescription fallbacks also
  // get a Load column. Programmers flip it off for plyometric / no-load
  // movements where the column would just be noise.
  const tracksLoad = prescription ? prescription.tracksLoad : true
  const prescribed = useMemo(() => {
    const cols = new Set<keyof SetRow>()
    if (prescription) {
      if (prescription.reps !== null)     cols.add('reps')
      if (prescription.load !== null)     cols.add('load')
      if (prescription.tempo !== null)    cols.add('tempo')
      if (prescription.distance !== null) cols.add('distance')
      if (prescription.calories !== null) cols.add('calories')
      if (prescription.seconds !== null)  cols.add('seconds')
    }
    if (tracksLoad) cols.add('load')
    // Strength still defaults to showing reps as a useful baseline.
    if (category === 'Strength') cols.add('reps')
    if (cols.size === 0) { cols.add('reps') }
    return cols
  }, [prescription, category, tracksLoad])

  // Auto-show a column if the user has typed into any cell of it.
  // Columns reachable for this workout's category. Strength is barbell
  // work — distance / cals / seconds aren't relevant; load is reachable iff
  // the prescription opts in. MonoStructural is timed cardio — sets / reps /
  // load aren't. Metcon / Skill / Warmup keep every axis since their movement
  // mix varies, but still respect tracksLoad for the Load column.
  const availableColumns = useMemo<Set<keyof SetRow>>(() => {
    if (category === 'Strength') {
      const cols = new Set<keyof SetRow>(['reps', 'tempo'])
      if (tracksLoad) cols.add('load')
      return cols
    }
    if (category === 'MonoStructural') return new Set(['distance', 'calories', 'seconds'])
    const cols = new Set<keyof SetRow>(['reps', 'tempo', 'distance', 'calories', 'seconds'])
    if (tracksLoad) cols.add('load')
    return cols
  }, [category, tracksLoad])

  const visible = useMemo(() => {
    const cols = new Set(prescribed)
    for (const s of movement.sets) {
      ;(['reps', 'load', 'tempo', 'distance', 'calories', 'seconds'] as const).forEach((c) => {
        if (s[c] !== '') cols.add(c)
      })
    }
    return new Set([...cols].filter((c) => availableColumns.has(c)))
  }, [prescribed, movement.sets, availableColumns])

  const showColumns = ALL_COLUMNS.filter((c) => visible.has(c.key))
  const hiddenColumns = ALL_COLUMNS.filter((c) => !visible.has(c.key) && availableColumns.has(c.key))

  return (
    <View>
      {/* Unit pickers — only render when load or distance is in play */}
      {(visible.has('load') || visible.has('distance')) && (
        <View style={styles.unitRow}>
          {visible.has('load') && (
            <View style={styles.unitGroup}>
              <ThemedText variant="tertiary" style={styles.unitLabel}>Load:</ThemedText>
              <View style={styles.unitChips}>
                {LOAD_UNITS.map((u) => {
                  const isActive = movement.loadUnit === u.value
                  return (
                    <TouchableOpacity
                      key={u.value}
                      style={[
                        styles.unitChip,
                        { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                        isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                      ]}
                      onPress={() => onUnitChange(movementIdx, 'loadUnit', u.value)}
                      accessibilityLabel={`Load unit ${u.label}`}
                      testID={`load-unit-${u.value}`}
                    >
                      <ThemedText
                        variant="tertiary"
                        style={[styles.unitChipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                      >
                        {u.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
          {visible.has('distance') && (
            <View style={styles.unitGroup}>
              <ThemedText variant="tertiary" style={styles.unitLabel}>Distance:</ThemedText>
              <View style={styles.unitChips}>
                {DISTANCE_UNITS.map((u) => {
                  const isActive = movement.distanceUnit === u.value
                  return (
                    <TouchableOpacity
                      key={u.value}
                      style={[
                        styles.unitChip,
                        { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                        isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                      ]}
                      onPress={() => onUnitChange(movementIdx, 'distanceUnit', u.value)}
                      accessibilityLabel={`Distance unit ${u.label}`}
                      testID={`distance-unit-${u.value}`}
                    >
                      <ThemedText
                        variant="tertiary"
                        style={[styles.unitChipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                      >
                        {u.label}
                      </ThemedText>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Header row */}
      <View style={[styles.tableHeaderRow, { borderBottomColor: colors.borderSubtle }]}>
        <ThemedText variant="tertiary" style={[styles.tableHeaderCell, styles.tableSetCol]}>Set</ThemedText>
        {showColumns.map((c) => (
          <ThemedText key={c.key} variant="tertiary" style={styles.tableHeaderCell}>{c.label}</ThemedText>
        ))}
        <View style={styles.tableRemoveCol} />
      </View>

      {/* Body rows */}
      {movement.sets.map((s, sIdx) => (
        <View key={sIdx} style={styles.tableRow}>
          <ThemedText variant="tertiary" style={[styles.tableSetIdx, styles.tableSetCol]}>{sIdx + 1}</ThemedText>
          {showColumns.map((c) => (
            <View key={c.key} style={styles.tableCell}>
              <TextInput
                style={[
                  styles.tableInput,
                  { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
                ]}
                value={s[c.key]}
                onChangeText={(v) => onUpdate(movementIdx, sIdx, c.key, v)}
                placeholder={c.key === 'load' && planLoadPlaceholders?.[sIdx] ? planLoadPlaceholders[sIdx] : c.placeholder}
                placeholderTextColor={colors.textPlaceholder}
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
                <ThemedText variant="tertiary" style={styles.removeBtnText}>×</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Action buttons */}
      <View style={styles.tableActions}>
        <TouchableOpacity
          style={[styles.addSetBtn, { backgroundColor: colors.surfaceSubtle }]}
          onPress={() => onAddSet(movementIdx)}
          accessibilityLabel="Add set"
          testID="add-set"
        >
          <ThemedText variant="secondary" style={styles.addSetBtnText}>+ Add set</ThemedText>
        </TouchableOpacity>
        {hiddenColumns.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[styles.addColBtn, { backgroundColor: colors.cardBg }]}
            onPress={() => onUpdate(movementIdx, 0, c.key, c.placeholder.split(' ')[0])}
            accessibilityLabel={`Add ${c.label} column`}
            testID={`add-col-${c.key}`}
          >
            <ThemedText variant="tertiary" style={styles.addColBtnText}>+ {c.label}</ThemedText>
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
  const { colors } = useTheme()
  const primaryTintBg = `${colors.primary}33`

  const update = <K extends keyof ScoreFieldState>(field: K, value: ScoreFieldState[K]) =>
    onChange({ ...fields, [field]: value })

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.inputBg, borderColor: colors.borderInteractive, color: colors.textPrimary },
  ]

  if (kind === 'ROUNDS_REPS') {
    return (
      <View>
        <ThemedText variant="tertiary" style={styles.sectionLabel}>SCORE</ThemedText>
        <View style={styles.inlineInputs}>
          {_workout.tracksRounds && (
            <View style={styles.inputGroup}>
              <ThemedText variant="tertiary" style={styles.inputLabel}>Rounds</ThemedText>
              <TextInput
                style={inputStyle}
                keyboardType="number-pad"
                value={fields.rounds}
                onChangeText={(v) => update('rounds', v)}
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                testID="rounds-input"
              />
            </View>
          )}
          <View style={styles.inputGroup}>
            <ThemedText variant="tertiary" style={styles.inputLabel}>Reps</ThemedText>
            <TextInput
              style={inputStyle}
              keyboardType="number-pad"
              value={fields.reps}
              onChangeText={(v) => update('reps', v)}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
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
        <ThemedText variant="tertiary" style={styles.sectionLabel}>TIME</ThemedText>
        <View style={styles.inlineInputs}>
          <View style={styles.inputGroup}>
            <ThemedText variant="tertiary" style={styles.inputLabel}>Minutes</ThemedText>
            <TextInput
              style={[...inputStyle, fields.cappedOut && styles.inputDisabled]}
              keyboardType="number-pad"
              value={fields.minutes}
              onChangeText={(v) => update('minutes', v)}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
              editable={!fields.cappedOut}
              testID="minutes-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <ThemedText variant="tertiary" style={styles.inputLabel}>Seconds</ThemedText>
            <TextInput
              style={[...inputStyle, fields.cappedOut && styles.inputDisabled]}
              keyboardType="number-pad"
              value={fields.seconds}
              onChangeText={(v) => update('seconds', v)}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
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
          <View
            style={[
              styles.checkbox,
              { borderColor: colors.borderInteractive },
              fields.cappedOut && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
          >
            {fields.cappedOut && <ThemedText style={[styles.checkmark, { color: colors.onPrimary }]}>✓</ThemedText>}
          </View>
          <ThemedText variant="secondary" style={styles.toggleLabel}>Time capped (didn't finish)</ThemedText>
        </TouchableOpacity>
      </View>
    )
  }
  if (kind === 'DISTANCE') {
    return (
      <View>
        <ThemedText variant="tertiary" style={styles.sectionLabel}>DISTANCE</ThemedText>
        <View style={styles.inlineInputs}>
          <View style={[styles.inputGroup, { flex: 2 }]}>
            <ThemedText variant="tertiary" style={styles.inputLabel}>Distance</ThemedText>
            <TextInput
              style={inputStyle}
              keyboardType="decimal-pad"
              value={fields.distance}
              onChangeText={(v) => update('distance', v)}
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
              testID="distance-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <ThemedText variant="tertiary" style={styles.inputLabel}>Unit</ThemedText>
            <View style={styles.unitChipsCol}>
              {DISTANCE_UNITS.map((u) => {
                const isActive = fields.distanceUnit === u.value
                return (
                  <TouchableOpacity
                    key={u.value}
                    style={[
                      styles.unitChip,
                      { backgroundColor: colors.cardBg, borderColor: colors.borderInteractive },
                      isActive && { backgroundColor: primaryTintBg, borderColor: colors.primary },
                    ]}
                    onPress={() => update('distanceUnit', u.value)}
                    testID={`score-distance-unit-${u.value}`}
                  >
                    <ThemedText
                      variant="tertiary"
                      style={[styles.unitChipText, isActive && { color: colors.primary, fontWeight: '600' }]}
                    >
                      {u.label}
                    </ThemedText>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        </View>
      </View>
    )
  }
  // CALORIES
  return (
    <View>
      <ThemedText variant="tertiary" style={styles.sectionLabel}>CALORIES</ThemedText>
      <TextInput
        style={inputStyle}
        keyboardType="number-pad"
        value={fields.calories}
        onChangeText={(v) => update('calories', v)}
        placeholder="0"
        placeholderTextColor={colors.textPlaceholder}
        testID="calories-input"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  workoutType: { fontSize: 13, marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
  },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 16,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  inlineInputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputDisabled: { opacity: 0.4 },
  notesSection: { flex: 1, minHeight: 120 },
  notesInput: { textAlignVertical: 'top', flex: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, borderTopWidth: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontSize: 14, fontWeight: '700' },
  toggleLabel: { fontSize: 14 },
  error: { fontSize: 13, marginTop: 12, textAlign: 'center' },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '600' },
  deleteBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { fontSize: 14, fontWeight: '500' },

  // Sets table
  setsSection: { marginTop: 16 },

  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  unitGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unitLabel: { fontSize: 12 },
  unitChips: { flexDirection: 'row', gap: 4 },
  unitChipsCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  unitChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 6,
  },
  unitChipText: { fontSize: 12, fontWeight: '500' },

  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tableHeaderCell: {
    flex: 1,
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
  tableSetIdx: { fontSize: 12, paddingRight: 4 },
  tableCell: { flex: 1, paddingHorizontal: 2 },
  tableInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { fontSize: 18, fontWeight: '600' },
  tableActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  addSetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addSetBtnText: { fontSize: 12, fontWeight: '600' },
  addColBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addColBtnText: { fontSize: 12, fontWeight: '500' },
})
