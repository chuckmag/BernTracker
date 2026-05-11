import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { requireKeycloakAuth } from './auth/keycloak.js'
import { createMcpServer } from './server.js'

async function startStdio(): Promise<void> {
  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function startHttp(): Promise<void> {
  const app = express()
  app.use(express.json())

  // OIDC discovery — proxies Keycloak's authorization server metadata so MCP
  // clients can discover the authorization endpoint automatically (RFC 8414).
  app.get('/.well-known/oauth-authorization-server', async (_req, res) => {
    const issuer = process.env.KEYCLOAK_ISSUER_URL
    if (!issuer) {
      res.status(503).json({ error: 'Authorization server not configured' })
      return
    }
    try {
      const discovery = await fetch(`${issuer}/.well-known/openid-configuration`)
      const body = await discovery.json()
      res.json(body)
    } catch {
      res.status(502).json({ error: 'Failed to reach authorization server' })
    }
  })

  // Streamable HTTP — primary transport (MCP spec 2025-03-26)
  app.post('/mcp', requireKeycloakAuth, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = createMcpServer()
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  // Legacy SSE — compatibility for clients not yet on Streamable HTTP
  const sseTransports = new Map<string, SSEServerTransport>()

  app.get('/sse', requireKeycloakAuth, async (req, res) => {
    const transport = new SSEServerTransport('/messages', res)
    const sessionId = transport.sessionId
    sseTransports.set(sessionId, transport)
    res.on('close', () => sseTransports.delete(sessionId))

    const server = createMcpServer()
    await server.connect(transport)
    await transport.start()
  })

  app.post('/messages', requireKeycloakAuth, async (req, res) => {
    const sessionId = req.query['sessionId'] as string | undefined
    const transport = sessionId ? sseTransports.get(sessionId) : undefined
    if (!transport) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    await transport.handlePostMessage(req, res, req.body)
  })

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
