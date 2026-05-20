/**
 * /goals — three-tab list of the caller's goals (Active / Completed /
 * Archived). Click-through lands at /goals/:id, the per-goal detail
 * page with the PR-chart goal overlay or Frequency bar chart.
 *
 * Create button opens GoalFormDialog (re-used by GoalsCard).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type GoalResponse, type GoalStatus } from '../lib/api'
import Skeleton from '../components/ui/Skeleton'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import ProgressRing from '../components/ui/ProgressRing'
import GoalFormDialog from '../components/GoalFormDialog'
import {
  GOAL_TYPE_GLYPH,
  GOAL_TYPE_LABEL,
  progressLabelFor,
  progressPercentFor,
  formatTargetDate,
} from '../lib/goalFormat'

const TABS: { key: GoalStatus; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'ARCHIVED', label: 'Archived' },
]

export default function Goals() {
  const [status, setStatus] = useState<GoalStatus>('ACTIVE')
  const [goals, setGoals] = useState<GoalResponse[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.users.me.goals.list({ status })
      .then((rows) => { if (!cancelled) setGoals(rows) })
      .catch(() => { if (!cancelled) setGoals([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, bump])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Goals</h1>
        <Button variant="primary" onClick={() => setDialogOpen(true)}>+ New goal</Button>
      </div>

      <div
        role="tablist"
        aria-label="Goal status"
        className="flex gap-2 border-b border-slate-200 dark:border-gray-800 mb-5"
      >
        {TABS.map((tab) => {
          const selected = tab.key === status
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setStatus(tab.key)}
              className={[
                'px-3 py-2 -mb-px text-sm font-medium transition-colors border-b-2',
                selected
                  ? 'border-primary text-slate-950 dark:text-white'
                  : 'border-transparent text-slate-500 dark:text-gray-400 hover:text-slate-950 dark:hover:text-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950 rounded',
              ].join(' ')}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {loading && <Skeleton variant="feed-row" count={3} />}

      {!loading && goals && goals.length === 0 && (
        <EmptyState
          title={
            status === 'ACTIVE' ? 'No active goals' :
            status === 'COMPLETED' ? 'No completed goals yet' :
            'No archived goals'
          }
          body={
            status === 'ACTIVE'
              ? 'Pick something to chase — a heavier lift, more workouts per week, or a one-off accomplishment.'
              : 'Goals you finish or archive will show up here.'
          }
          cta={status === 'ACTIVE' ? { label: '+ New goal', onClick: () => setDialogOpen(true) } : undefined}
        />
      )}

      {!loading && goals && goals.length > 0 && (
        <ul className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl divide-y divide-slate-200 dark:divide-gray-800">
          {goals.map((g) => <GoalRow key={g.id} goal={g} />)}
        </ul>
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
  const complete = goal.progress.type === 'HABIT' ? !!goal.completedAt : goal.progress.isComplete
  return (
    <li>
      <Link
        to={`/goals/${goal.id}`}
        className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
      >
        <ProgressRing percent={percent} complete={complete} size={52} strokeWidth={6} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" className="shrink-0">{GOAL_TYPE_GLYPH[goal.type]}</span>
            <p className="text-sm font-medium text-slate-950 dark:text-gray-100 truncate" title={goal.title}>
              {goal.title}
            </p>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
              {GOAL_TYPE_LABEL[goal.type]}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-gray-400 tabular-nums mt-0.5">
            {progressLabelFor(goal)} · {formatTargetDate(goal.targetDate)}
          </p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-slate-400 dark:text-gray-500">›</span>
      </Link>
    </li>
  )
}
