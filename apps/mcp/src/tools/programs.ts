import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerProgramTools(server: McpServer): void {
  server.tool(
    'get_programs',
    'List programs the user is enrolled in, including their personal program.',
    {},
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )

  server.tool(
    'create_workout',
    "Create a workout in the user's personal program.",
    {
      title: z.string().describe('Workout title'),
      type: z
        .enum(['STRENGTH', 'FOR_TIME', 'EMOM', 'CARDIO', 'AMRAP', 'METCON', 'WARMUP'])
        .describe('Workout type'),
      description: z.string().optional().describe('Workout description or notes'),
      scheduledAt: z.string().optional().describe('ISO datetime string for when the workout is scheduled'),
      movements: z
        .array(
          z.object({
            name: z.string(),
            sets: z.number().int().optional(),
            reps: z.number().int().optional(),
            notes: z.string().optional(),
          }),
        )
        .optional()
        .default([])
        .describe('Movement list'),
    },
    async (_args, _extra) => {
      return { content: [{ type: 'text', text: 'not implemented' }], isError: true }
    },
  )
}
