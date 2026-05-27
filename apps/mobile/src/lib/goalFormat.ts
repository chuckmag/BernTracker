import type { GoalResponse } from './api'

// Renders a single numeric "current / target" label per goal — shared
// between the dashboard `GoalsCard` and the `GoalsScreen` list rows.
// Lived in GoalsCard before; moved out so the two consumers don't
// import a UI component just for a string helper.
export function formatProgressLabel(goal: GoalResponse): string {
  const p = goal.progress
  if (p.type === 'PR_TARGET') {
    const cur = p.current === null ? '—' : String(p.current)
    const unit = p.unit ? ` ${p.unit}` : ''
    return `${cur} / ${p.target}${unit}`
  }
  if (p.type === 'FREQUENCY') {
    return `${p.workoutsLogged} / ${p.workoutsRequired} workouts`
  }
  // HABIT — no measurable progress in v1; show lifecycle state instead.
  return goal.status === 'COMPLETED' ? 'Completed' : 'In progress'
}
