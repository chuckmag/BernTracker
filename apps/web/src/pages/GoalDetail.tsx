/**
 * /goals/:id — per-goal detail page.
 *
 * PR Target: re-uses the trajectory line chart from MovementDetailPanel
 * (recharts LineChart) with a ReferenceLine at the goal target value.
 * The trajectory endpoint is reached via api.me.analytics.movementTrajectory
 * — only available for *movement* PR targets in v1; named-workout
 * PR targets fall back to a placeholder until a benchmark trajectory
 * endpoint is added.
 *
 * Frequency: a simple weekly bar chart of logged vs required workouts.
 * Synthesizes per-week buckets from the progress totals — the API
 * returns aggregates only in v1, so the chart shows the current and
 * required pace rather than a per-week breakdown.
 *
 * Habit: no chart. Title + manual "Mark complete" toggle + a v2
 * placeholder for daily check-ins.
 *
 * Kebab menu actions: edit title/target date, archive, delete.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import WorkoutMovementHistory from '../components/WorkoutMovementHistory.tsx'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import {
  api,
  type GoalResponse,
  type MovementTrajectoryData,
  type MovementPrType,
} from '../lib/api'
import Skeleton from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import SegmentedControl from '../components/ui/SegmentedControl'
import ChartTooltip from '../components/ui/ChartTooltip'
import { useTheme } from '../context/ThemeContext'
import { resolveTheme } from '../lib/useTheme'
import { BRAND_TOKENS } from '../lib/designTokens'
import {
  GOAL_TYPE_GLYPH,
  GOAL_TYPE_LABEL,
  progressLabelFor,
  formatTargetDate,
  targetLabelFor,
} from '../lib/goalFormat'

type Range = '1M' | '3M' | '6M' | '1Y'
const RANGES: { value: Range; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
]

const PR_TYPE_FOR_TRAJECTORY: Record<NonNullable<GoalResponse['targetPrType']>, MovementPrType> = {
  LOAD: 'LOAD',
  MAX_REPS: 'MAX_REPS',
  TIME: 'TIME',
  DISTANCE: 'DISTANCE',
  CALORIES: 'CALORIES',
}

export default function GoalDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [goal, setGoal] = useState<GoalResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api.goals.get(id)
      .then((g) => { if (!cancelled) setGoal(g) })
      .catch((e: Error & { status?: number }) => {
        if (cancelled) return
        if (e.status === 403) setError("You don't have access to this goal.")
        else if (e.status === 404) setError('Goal not found.')
        else setError(e.message ?? 'Failed to load goal')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, bump])

  async function handleArchive() {
    if (!goal) return
    const updated = await api.goals.update(goal.id, { status: 'ARCHIVED' })
    setGoal(updated)
    setMenuOpen(false)
  }

  async function handleUnarchive() {
    if (!goal) return
    const updated = await api.goals.update(goal.id, { status: 'ACTIVE' })
    setGoal(updated)
    setMenuOpen(false)
  }

  async function handleDelete() {
    if (!goal) return
    // window.confirm matches the rest of the app's destructive-action UX
    // (ConfirmDialog primitive is queued in apps/web/CLAUDE.md → Patterns).
    if (!window.confirm('Delete this goal? This cannot be undone.')) return
    await api.goals.remove(goal.id)
    navigate('/goals')
  }

  async function handleMarkComplete() {
    if (!goal) return
    const next = goal.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED'
    const updated = await api.goals.update(goal.id, { status: next })
    setGoal(updated)
  }

  if (loading) return <Skeleton variant="feed-row" count={3} />
  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Button variant="tertiary" onClick={() => navigate('/goals')}>← Back to goals</Button>
        <p className="mt-4 text-sm text-rose-700 dark:text-rose-400">{error}</p>
      </div>
    )
  }
  if (!goal) return null

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="tertiary" onClick={() => navigate('/goals')}>← Back to goals</Button>

      <header className="flex items-start gap-3 mt-3 mb-5">
        <div className="text-3xl" aria-hidden="true">{GOAL_TYPE_GLYPH[goal.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
            {GOAL_TYPE_LABEL[goal.type]}
          </p>
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">{goal.title}</h1>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            {progressLabelFor(goal)} · {formatTargetDate(goal.targetDate)}
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="Goal actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 inline-flex items-center justify-center rounded text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-lg overflow-hidden z-10"
            >
              <button type="button" role="menuitem" onClick={() => { setEditing(true); setMenuOpen(false) }}
                className="block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800">
                Edit
              </button>
              {goal.status !== 'ARCHIVED' ? (
                <button type="button" role="menuitem" onClick={handleArchive}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800">
                  Archive
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={handleUnarchive}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800">
                  Unarchive
                </button>
              )}
              <button type="button" role="menuitem" onClick={handleDelete}
                className="block w-full text-left px-3 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                Delete
              </button>
            </div>
          )}
        </div>
      </header>

      {editing && (
        <EditGoalInline
          goal={goal}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setGoal(updated)
            setEditing(false)
            setBump((b) => b + 1)
          }}
        />
      )}

      {/* Type-specific body */}
      {goal.type === 'PR_TARGET' && <PrTargetBody goal={goal} bump={bump} />}
      {goal.type === 'FREQUENCY' && <FrequencyBody goal={goal} />}
      {goal.type === 'HABIT' && (
        <HabitBody goal={goal} onToggleComplete={handleMarkComplete} />
      )}
    </div>
  )
}

// ─── PR Target chart ─────────────────────────────────────────────────────────

function PrTargetBody({ goal, bump }: { goal: GoalResponse; bump: number }) {
  const [range, setRange] = useState<Range>('3M')
  const [data, setData] = useState<MovementTrajectoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'

  const movementId = goal.movementId
  const prType = goal.targetPrType ? PR_TYPE_FOR_TRAJECTORY[goal.targetPrType] : null

  useEffect(() => {
    if (!movementId || !prType) { setLoading(false); return }
    setLoading(true)
    api.me.analytics.movementTrajectory(movementId, prType, range)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
    // `bump` is incremented by parent after a successful backfill so the
    // trajectory chart refreshes alongside WorkoutMovementHistory.
  }, [movementId, prType, range, bump])

  if (!movementId) {
    // v1 limitation: named-workout PR-target goals show the target + current
    // progress text, but no trajectory chart (no benchmark trajectory endpoint
    // yet). The progress percentage on the header still works since the
    // server-side computeGoalProgress handles named-workout PRs.
    return (
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5">
        <p className="text-sm text-slate-700 dark:text-gray-300">
          {goal.namedWorkout?.name ?? 'Named workout'} —
          {goal.progress.type === 'PR_TARGET' && goal.progress.current != null ? (
            <> current best <strong>{goal.progress.current}</strong> vs target <strong>{goal.progress.target}</strong></>
          ) : (
            <> log your first attempt to start tracking progress.</>
          )}
        </p>
        <p className="text-xs text-slate-400 dark:text-gray-500 mt-2">
          Trajectory chart for named-workout goals coming soon.
        </p>
      </div>
    )
  }

  if (loading) return <Skeleton variant="feed-row" count={1} />

  const primary = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const gridColor = isDark ? '#374151' : '#e2e8f0'
  const textColor = isDark ? '#9ca3af' : '#64748b'
  const accent = isDark ? BRAND_TOKENS.dark.accent : BRAND_TOKENS.light.accent

  const movementName = goal.movement?.name ?? 'Movement'

  return (
    <div className="space-y-4">
      {/* Movement attribution + deep-link to MovementsPage where the user
          can see the full movement detail (chart + PR table + backfill).
          MovementsPage reads `?movementId` on mount and auto-opens the
          matching detail panel. */}
      <Link
        to={`/wodalytics/movements?movementId=${movementId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 rounded"
      >
        <span aria-hidden="true">›</span> View {movementName} on Movements
      </Link>

      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {movementName} trajectory
          </p>
          <SegmentedControl options={RANGES} value={range} onChange={setRange} />
        </div>
      {!data || data.points.length < 2 ? (
        <p className="text-xs text-slate-400 dark:text-gray-500 py-4">
          Not enough data to chart trajectory yet — log a couple of results to start the line.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="achievedAt"
              tickFormatter={(v: string) =>
                new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
              }
              tick={{ fontSize: 10, fill: textColor }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="value"
              tick={{ fontSize: 10, fill: textColor }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const pt = payload[0].payload as { achievedAt: string; value: number; label: string }
                return (
                  <ChartTooltip
                    date={new Date(pt.achievedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    lines={[{ text: pt.label ?? String(pt.value), accent: true }]}
                  />
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {goal.targetValue != null && (
              <ReferenceLine
                y={goal.targetValue}
                stroke={accent}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{
                  value: targetLabelFor(goal),
                  position: 'insideTopRight',
                  fill: accent,
                  fontSize: 11,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
      </div>

      {/* Full movement history — PR table + backfill modal + past results.
          Reuses the WodDetail component; `currentWorkoutId` is left
          undefined because Goal Detail has no current-workout context. */}
      <WorkoutMovementHistory movementId={movementId} movementName={movementName} />
    </div>
  )
}

// ─── Frequency chart ─────────────────────────────────────────────────────────

function FrequencyBody({ goal }: { goal: GoalResponse }) {
  // V1: synthesize the weekly bars from the running aggregate. The full
  // per-week breakdown would require an additional API endpoint (#430
  // follow-up).
  const data = useMemo(() => {
    if (goal.progress.type !== 'FREQUENCY') return []
    const required = goal.frequencyPerWeek ?? 0
    const weeksTotal = goal.frequencyWeeks ?? 0
    const weeksDone = Math.max(0, weeksTotal - goal.progress.weeksRemaining)
    const currentWeekCount = goal.progress.currentWeekCount
    return Array.from({ length: Math.max(weeksTotal, 1) }, (_, i) => {
      // Stand-in per-week breakdown until a dedicated endpoint lands
      // (#430 follow-up): completed weeks show the full required count,
      // the current week shows the live partial, future weeks are 0.
      const isCurrent = i === weeksDone
      const isDone = i < weeksDone
      const weeklyLogged = isDone ? required : isCurrent ? currentWeekCount : 0
      return {
        week: `W${i + 1}`,
        logged: Math.min(weeklyLogged, required),
        required,
      }
    })
  }, [goal])

  const { mode } = useTheme()
  const isDark = resolveTheme(mode) === 'dark'
  const gridColor = isDark ? '#374151' : '#e2e8f0'
  const textColor = isDark ? '#9ca3af' : '#64748b'
  const primary = isDark ? BRAND_TOKENS.dark.primary : BRAND_TOKENS.light.primary
  const muted = isDark ? '#475569' : '#cbd5e1'

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
      <p className="text-xs text-slate-500 dark:text-gray-400 mb-2">Weekly progress</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'transparent' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="required" fill={muted} name="Required" />
          <Bar dataKey="logged" fill={primary} name="Logged" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Habit body ──────────────────────────────────────────────────────────────

function HabitBody({ goal, onToggleComplete }: { goal: GoalResponse; onToggleComplete: () => void }) {
  const completed = goal.status === 'COMPLETED'
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-950 dark:text-gray-100">
            {completed ? 'Goal completed' : 'Mark this goal complete when you finish it'}
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">
            {formatTargetDate(goal.targetDate)}
          </p>
        </div>
        <Button variant={completed ? 'secondary' : 'accent'} onClick={onToggleComplete}>
          {completed ? 'Mark active' : 'Mark complete'}
        </Button>
      </div>
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 border-dashed rounded-2xl p-4 text-xs text-slate-500 dark:text-gray-400">
        Daily check-ins coming soon.
      </div>
    </div>
  )
}

// ─── Inline edit form ────────────────────────────────────────────────────────

function EditGoalInline({
  goal,
  onCancel,
  onSaved,
}: {
  goal: GoalResponse
  onCancel: () => void
  onSaved: (g: GoalResponse) => void
}) {
  const [title, setTitle] = useState(goal.title)
  const [targetDate, setTargetDate] = useState(goal.targetDate ? goal.targetDate.slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.goals.update(goal.id, {
        title: title.trim() || undefined,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      })
      onSaved(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 mb-4 space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="edit-title" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">Title</label>
        <input
          ref={inputRef}
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="edit-date" className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-500">Target date</label>
        <input
          id="edit-date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {error && <p className="text-xs text-rose-700 dark:text-rose-400" role="alert">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}
