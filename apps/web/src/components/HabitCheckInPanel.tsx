/**
 * Body of the Goal Detail page when the goal is HABIT. Replaces the v1
 * "Mark complete" block with the v2 check-in flow:
 *
 *   - Streak hero with currentStreak / longestStreak
 *   - Big primary "I did it today" tap (or "Checked in for today" with
 *     undo + note-edit affordances)
 *   - Last-7-days strip of dots, newest right
 *   - Paginated check-in history list
 *
 * All state is local to this panel — the parent owns the goal and
 * receives the refreshed copy back via onGoalChange after every write.
 */
import { useEffect, useState } from 'react'
import { api, type GoalResponse, type GoalCheckInResponse } from '../lib/api'
import Button from './ui/Button'
import Skeleton from './ui/Skeleton'

const NOTE_MAX = 280
const HISTORY_PAGE_SIZE = 20

interface Props {
  goal: GoalResponse
  onGoalChange: (next: GoalResponse) => void
}

export default function HabitCheckInPanel({ goal, onGoalChange }: Props) {
  if (goal.progress.type !== 'HABIT') return null
  const progress = goal.progress

  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<GoalCheckInResponse[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)

  // Today's row is computed off `last7Days[0]`. When the user has already
  // checked in we want the note in the history list to pre-fill the
  // editor — finding it is one fetch's worth of work, not a separate
  // round-trip.
  const todayRow = history?.find((h) => h.date === progress.last7Days[0]?.date) ?? null

  useEffect(() => {
    let cancelled = false
    setHistoryLoading(true)
    api.goals.checkIns
      .list(goal.id, { limit: HISTORY_PAGE_SIZE })
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch(() => { if (!cancelled) setHistory([]) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [goal.id])

  // Sync the note draft to whatever's saved when the goal refreshes
  // (e.g. after a record, history reload, or external goal update).
  useEffect(() => {
    setNoteDraft(todayRow?.note ?? '')
  }, [todayRow?.id, todayRow?.note])

  async function handleRecord() {
    if (busy) return
    setBusy(true)
    try {
      const trimmed = noteDraft.trim()
      const { goal: next } = await api.goals.checkIns.record(goal.id, {
        note: trimmed.length > 0 ? trimmed : undefined,
      })
      onGoalChange(next)
      // Refresh history so the new tap shows up at the top.
      const rows = await api.goals.checkIns.list(goal.id, { limit: HISTORY_PAGE_SIZE })
      setHistory(rows)
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo() {
    if (busy) return
    if (!progress.last7Days[0]) return
    const today = progress.last7Days[0].date
    setBusy(true)
    try {
      const { goal: next } = await api.goals.checkIns.remove(goal.id, today)
      onGoalChange(next)
      setNoteDraft('')
      const rows = await api.goals.checkIns.list(goal.id, { limit: HISTORY_PAGE_SIZE })
      setHistory(rows)
    } finally {
      setBusy(false)
    }
  }

  const noteTooLong = noteDraft.length > NOTE_MAX

  return (
    <div className="space-y-4">
      <StreakHero
        currentStreak={progress.currentStreak}
        longestStreak={progress.longestStreak}
        checkedInToday={progress.checkedInToday}
      />

      <Last7DaysStrip last7Days={progress.last7Days} />

      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
        <label
          htmlFor="check-in-note"
          className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400 block"
        >
          Optional note
        </label>
        <textarea
          id="check-in-note"
          rows={2}
          maxLength={NOTE_MAX + 50 /* let user paste long text; we still 400 above NOTE_MAX */}
          placeholder="A word about today (optional)"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-950 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <p
            className={`text-[11px] tabular-nums ${noteTooLong ? 'text-rose-700 dark:text-rose-400' : 'text-slate-400 dark:text-gray-500'}`}
          >
            {noteDraft.length}/{NOTE_MAX}
          </p>
          {progress.checkedInToday ? (
            <div className="flex gap-2">
              <Button variant="tertiary" onClick={handleUndo} disabled={busy}>
                Undo
              </Button>
              <Button variant="primary" onClick={handleRecord} disabled={busy || noteTooLong}>
                Save note
              </Button>
            </div>
          ) : (
            <Button variant="accent" onClick={handleRecord} disabled={busy || noteTooLong}>
              {busy ? 'Saving…' : 'I did it today'}
            </Button>
          )}
        </div>
      </div>

      <HistoryList history={history} loading={historyLoading} />
    </div>
  )
}

// ─── Streak hero ─────────────────────────────────────────────────────────────

function StreakHero({
  currentStreak,
  longestStreak,
  checkedInToday,
}: {
  currentStreak: number
  longestStreak: number
  checkedInToday: boolean
}) {
  const zero = currentStreak === 0
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
        Current streak
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-slate-950 dark:text-white tabular-nums">
          {currentStreak}
        </span>
        <span className="text-sm text-slate-500 dark:text-gray-400">
          {currentStreak === 1 ? 'day' : 'days'}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
        {zero
          ? 'Tap below to start a streak.'
          : checkedInToday
            ? 'Locked in for today.'
            : 'Tap below before midnight to keep the streak alive.'}
      </p>
      {longestStreak > 0 && (
        <p className="mt-1 text-xs text-slate-400 dark:text-gray-500 tabular-nums">
          Longest streak: {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
        </p>
      )}
    </div>
  )
}

// ─── Last-7-days strip ───────────────────────────────────────────────────────

function Last7DaysStrip({
  last7Days,
}: {
  last7Days: Array<{ date: string; checkedIn: boolean }>
}) {
  // API returns newest first; render oldest first so the row reads
  // left-to-right like a calendar.
  const reversed = [...last7Days].reverse()
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400 mb-2">
        Last 7 days
      </p>
      <div
        className="flex items-center justify-between gap-1.5"
        role="list"
        aria-label="Last 7 days"
      >
        {reversed.map((d) => (
          <div
            key={d.date}
            role="listitem"
            title={`${d.date} — ${d.checkedIn ? 'checked in' : 'no check-in'}`}
            className={`flex-1 h-8 rounded-md ${
              d.checkedIn
                ? 'bg-accent/20 border border-accent/60 dark:border-accent/40'
                : 'bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-800'
            }`}
            aria-label={`${d.date} ${d.checkedIn ? 'checked in' : 'no check-in'}`}
          />
        ))}
      </div>
    </div>
  )
}

// ─── History list ────────────────────────────────────────────────────────────

function HistoryList({
  history,
  loading,
}: {
  history: GoalCheckInResponse[] | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4">
        <Skeleton variant="history-row" count={3} />
      </div>
    )
  }
  if (!history || history.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl p-4 text-xs text-slate-500 dark:text-gray-400">
        No check-ins yet. Tap above to record your first.
      </div>
    )
  }
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <p className="px-4 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
        Check-in history
      </p>
      <ul className="divide-y divide-slate-200 dark:divide-gray-800">
        {history.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <p className="text-sm text-slate-950 dark:text-gray-100 tabular-nums">{row.date}</p>
            {row.note && (
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{row.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
