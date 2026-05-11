import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerResultTools(server: McpServer): void {
  server.tool(
    'get_workout_results',
    'Get public leaderboard results for a workout.',
    {
      workoutId: z.string().describe('Workout ID'),
      gender: z.enum(['MALE', 'FEMALE', 'OPEN']).optional().describe('Filter by workout gender category'),
      level: z
        .enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED'])
        .optional()
        .describe('Filter by workout level'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )

  server.tool(
    'get_my_results',
    "Get the calling user's own results.",
    {
      workoutId: z.string().optional().describe('Filter by workout ID'),
      programId: z.string().optional().describe('Filter by program ID'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )

  server.tool(
    'log_result',
    'Post a result for any workout the user has access to.',
    {
      workoutId: z.string().describe('Workout ID'),
      level: z.enum(['RX_PLUS', 'RX', 'SCALED', 'MODIFIED']).describe('Workout level'),
      workoutGender: z.enum(['MALE', 'FEMALE', 'OPEN']).describe('Workout gender category for leaderboard grouping'),
      value: z.record(z.unknown()).describe('Result value — shape defined by packages/types result schemas'),
      notes: z.string().optional().describe('Optional notes'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )
}
