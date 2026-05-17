import { z } from 'zod'

export const TrajectoryRangeSchema = z.enum(['1M', '3M', '6M', '1Y'])
export type TrajectoryRange = z.infer<typeof TrajectoryRangeSchema>
