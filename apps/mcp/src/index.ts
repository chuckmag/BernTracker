import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './server.js'
import { createMcpApp } from './app.js'

async function startStdio(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function startHttp(): Promise<void> {
  const app = createMcpApp()
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002
  app.listen(port, () => {
    console.log(`INFO [mcp] listening on port ${port}`)
  })
}

if (process.argv.includes('--stdio')) {
  startStdio().catch((err) => {
    console.error('MCP stdio error', err)
    process.exit(1)
  })
} else {
  startHttp().catch((err) => {
    console.error('MCP HTTP startup error', err)
    process.exit(1)
  })
}
