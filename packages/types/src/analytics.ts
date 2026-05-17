import { z } from 'zod'

// ─── Trajectory range ─────────────────────────────────────────────────────────

export const TrajectoryRangeSchema = z.enum(['1M', '3M', '6M', '1Y'])
export type TrajectoryRange = z.infer<typeof TrajectoryRangeSchema>

// ─── Movement PR types (mirrors Prisma MovementPrType enum) ──────────────────

export const MovementPrTypeSchema = z.enum(['LOAD', 'MAX_REPS', 'TIME', 'DISTANCE', 'CALORIES'])
export type MovementPrType = z.infer<typeof MovementPrTypeSchema>
