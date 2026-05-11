import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerWorkoutTools } from './tools/workouts.js'
import { registerProgramTools } from './tools/programs.js'
import { registerResultTools } from './tools/results.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'wodalytics',
    version: '0.1.0',
  })

  registerWorkoutTools(server)
  registerProgramTools(server)
  registerResultTools(server)

  return server
}
