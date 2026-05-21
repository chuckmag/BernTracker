/**
 * Display helpers for Goal rows / cards. Pure functions over the wire
 * shape — no React, no DOM. Re-used by GoalsCard, the /goals list,
 * and the goal detail page so a single source of truth controls
 * the per-type progress label and icon glyph.
 */
import type { GoalResponse } from '@wodalytics/types'

export const GOAL_TYPE_LABEL: Record<GoalResponse['type'], string> = {
  PR_TARGET: 'PR Target',
  FREQUENCY: 'Frequency',
  HABIT: 'Habit',
}

// Emoji glyphs are used instead of an icon library to stay
// dependency-free; web already uses emoji widely (Sidebar, HotTodayCard).
export const GOAL_TYPE_GLYPH: Record<GoalResponse['type'], string> = {
  PR_TARGET: '🎯',
  FREQUENCY: '🔁',
  HABIT: '✅',
}

const PR_TYPE_UNIT: Record<NonNullable<GoalResponse['targetPrType']>, string> = {
  LOAD: 'lb',
  MAX_REPS: 'reps',
  TIME: 's',
  DISTANCE: 'm',
  CALORIES: 'cal',
}

/**
 * "8 / 12 workouts", "295 / 315 lb", "—" for HABIT (no numeric progress).
 * Returns a string that's safe to drop into a numeric label row; never
 * returns null so callers don't need conditional rendering for the
 * unknown-progress case.
 */
export function progressLabelFor(goal: GoalResponse): string {
  const p = goal.progress
  if (p.type === 'PR_TARGET') {
    const unit = unitLabelFor(goal)
    const current = p.current ?? '—'
    return `${current} / ${p.target} ${unit}`.trim()
  }
  if (p.type === 'FREQUENCY') {
    return `${p.workoutsLogged} / ${p.workoutsRequired} workouts`
  }
  return goal.completedAt ? 'Completed' : 'In progress'
}

function unitLabelFor(goal: GoalResponse): string {
  if (goal.targetPrType === 'LOAD' && goal.targetLoadUnit) {
    return goal.targetLoadUnit.toLowerCase()
  }
  if (goal.targetPrType === 'DISTANCE' && goal.targetDistanceUnit) {
    return goal.targetDistanceUnit.toLowerCase()
  }
  if (goal.targetPrType) return PR_TYPE_UNIT[goal.targetPrType] ?? ''
  return ''
}

/** 0–100, clamped — never NaN. Habit goals report 0 if active, 100 if completed. */
export function progressPercentFor(goal: GoalResponse): number {
  const p = goal.progress
  if (p.type === 'PR_TARGET' || p.type === 'FREQUENCY') {
    return Math.max(0, Math.min(100, Math.round(p.percent)))
  }
  return goal.completedAt ? 100 : 0
}

export function formatTargetDate(iso: string | null): string {
  if (!iso) return 'no target date'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Short PR-target target label, e.g. "Goal: 315 lb". Used by the
 * detail-page chart's ReferenceLine — kept here so the chart and
 * card labels stay aligned.
 */
export function targetLabelFor(goal: GoalResponse): string {
  if (goal.targetValue == null) return 'Goal'
  return `Goal: ${goal.targetValue} ${unitLabelFor(goal)}`.trim()
}
