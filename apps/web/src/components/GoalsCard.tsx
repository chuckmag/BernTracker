/**
 * Dashboard right-rail card showing the caller's top 3 active goals.
 *
 * Empty state — "Set your first goal" with a primary CTA.
 * Populated state — up to 3 rows (progress ring + title + numeric label),
 * a "+ New goal" CTA, and a "View all" link to /goals.
 *
 * Refetches on `bump` increments so the "create" / "view all" flows
 * upstream can trigger a refresh without needing to lift state.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type GoalResponse } from '../lib/api'
import Skeleton from './ui/Skeleton'
import Button from './ui/Button'
import ProgressRing from './ui/ProgressRing'
import GoalFormDialog from './GoalFormDialog'
import {
  GOAL_TYPE_GLYPH,
  progressLabelFor,
  progressPercentFor,
} from '../lib/goalFormat'

const VISIBLE_LIMIT = 3

export default function GoalsCard() {
  const [goals, setGoals] = useState<GoalResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.users.me.goals.list({ status: 'ACTIVE' })
      .then((rows) => { if (!cancelled) setGoals(rows) })
      .catch(() => { if (!cancelled) setGoals([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bump])

  const visible = (goals ?? []).slice(0, VISIBLE_LIMIT)
  const isEmpty = !loading && (goals?.length ?? 0) === 0

  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
          🎯 Goals
        </span>
        <Link
          to="/goals"
          className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 rounded"
        >
          View all
        </Link>
      </div>

      {loading && (
        <div className="p-4">
          <Skeleton variant="feed-row" count={2} />
        </div>
      )}

      {isEmpty && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-slate-700 dark:text-gray-300 font-medium mb-1">No active goals yet</p>
          <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
            Pick something to chase — a heavier squat, more workouts/week, or a one-off goal.
          </p>
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            Set your first goal
          </Button>
        </div>
      )}

      {!loading && visible.length > 0 && (
        <div>
          {visible.map((g) => (
            <GoalRow key={g.id} goal={g} />
          ))}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="w-full text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 rounded"
            >
              + New goal
            </button>
          </div>
        </div>
      )}

      <GoalFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => setBump((b) => b + 1)}
      />
    </div>
  )
}

function GoalRow({ goal }: { goal: GoalResponse }) {
  const percent = progressPercentFor(goal)
  const complete = goal.progress.type === 'HABIT'
    ? !!goal.completedAt
    : goal.progress.isComplete
  const label = progressLabelFor(goal)

  return (
    <Link
      to={`/goals/${goal.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
    >
      <ProgressRing percent={percent} complete={complete} size={44} strokeWidth={5} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span aria-hidden="true" className="shrink-0">{GOAL_TYPE_GLYPH[goal.type]}</span>
          <p className="text-sm text-slate-950 dark:text-gray-100 font-medium truncate" title={goal.title}>
            {goal.title}
          </p>
        </div>
        <p className="text-xs text-slate-500 dark:text-gray-400 tabular-nums">{label}</p>
      </div>
    </Link>
  )
}
