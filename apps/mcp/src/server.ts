import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerWorkoutTools } from './tools/workouts.js'
import { registerProgramTools } from './tools/programs.js'
import { registerResultTools } from './tools/results.js'

export function createMcpServer(userId?: string): McpServer {
  const server = new McpServer({
    name: 'wodalytics',
    version: '0.1.0',
  })

  registerWorkoutTools(server, userId)
  registerProgramTools(server, userId)
  registerResultTools(server, userId)

  return server
}
