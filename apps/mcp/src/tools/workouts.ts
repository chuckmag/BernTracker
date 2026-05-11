import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerWorkoutTools(server: McpServer): void {
  server.tool(
    'list_workouts',
    'List workouts the user can see — gym schedule and enrolled programs.',
    {
      programId: z.string().optional().describe('Filter by program ID'),
      scheduledAfter: z.string().optional().describe('ISO date string lower bound for scheduledAt'),
      scheduledBefore: z.string().optional().describe('ISO date string upper bound for scheduledAt'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max results'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )

  server.tool(
    'get_workout',
    'Get full workout detail including movements.',
    {
      workoutId: z.string().describe('Workout ID'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )

  server.tool(
    'get_today_workout',
    "Shortcut: today's published workout from the user's gym.",
    {},
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )
}
