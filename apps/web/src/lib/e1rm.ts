// Repetition percentages of 1RM (strengthlevel.com)
export const E1RM_PCT: Record<number, number> = {
  1: 1.00, 2: 0.97, 3: 0.94, 4: 0.92, 5: 0.89,
  6: 0.86, 7: 0.83, 8: 0.81, 9: 0.78, 10: 0.75,
  11: 0.73, 12: 0.71, 13: 0.70, 14: 0.68, 15: 0.67,
  16: 0.65, 17: 0.64, 18: 0.63, 19: 0.61, 20: 0.60,
  21: 0.59, 22: 0.58, 23: 0.57, 24: 0.56, 25: 0.55,
  26: 0.54, 27: 0.53, 28: 0.52, 29: 0.51, 30: 0.50,
}

export interface BestSet {
  reps: number
  load: number
  e1rm: number
}

export function bestE1RMFromSets(sets: { load?: number; reps?: string }[]): BestSet | null {
  let best: BestSet | null = null
  for (const set of sets) {
    if (set.load === undefined || !set.reps) continue
    const reps = parseInt(set.reps, 10)
    if (isNaN(reps)) continue
    const pct = E1RM_PCT[reps]
    if (!pct) continue
    const e1rm = Math.round((set.load / pct) * 10) / 10
    if (best === null || e1rm > best.e1rm) best = { reps, load: set.load, e1rm }
  }
  return best
}
