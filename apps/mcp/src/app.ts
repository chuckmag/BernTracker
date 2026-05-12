import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { requireAuth } from './auth/keycloak.js'
import { createMcpServer } from './server.js'
import { requestLogger } from './middleware/requestLogger.js'

export function createApp(): express.Express {
  const app = express()
  app.use(express.json())
  app.use(requestLogger)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // RFC 9728 — OAuth 2.0 Protected Resource Metadata.
  // MCP clients (including Claude.ai) check this endpoint FIRST to discover
  // which authorization server protects this resource. Without it they cannot
  // start the OAuth flow and report the server as unreachable.
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    const issuer = process.env.KEYCLOAK_ISSUER_URL
    if (!issuer) {
      res.status(503).json({ error: 'Authorization server not configured' })
      return
    }
    const resource = process.env.MCP_PUBLIC_URL ?? `https://${_req.hostname}`
    res.json({
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [
        'wodalytics:workouts:read',
        'wodalytics:results:read',
        'wodalytics:results:write',
        'wodalytics:programs:write',
      ],
    })
  })

  // RFC 8414 — OAuth 2.0 Authorization Server Metadata.
  // Proxies Keycloak's discovery doc so clients that fall back to this
  // endpoint (or follow the authorization_servers pointer above) get the
  // full set of Keycloak endpoints.
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
  app.post('/mcp', requireAuth, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = createMcpServer()
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })

  // Legacy SSE — compatibility for clients not yet on Streamable HTTP
  const sseTransports = new Map<string, SSEServerTransport>()

  app.get('/sse', requireAuth, async (req, res) => {
    const transport = new SSEServerTransport('/messages', res)
    const sessionId = transport.sessionId
    sseTransports.set(sessionId, transport)
    res.on('close', () => sseTransports.delete(sessionId))

    const server = createMcpServer()
    // connect() calls transport.start() internally — do not call start() again
    await server.connect(transport)
  })

  app.post('/messages', requireAuth, async (req, res) => {
    const sessionId = req.query['sessionId'] as string | undefined
    const transport = sessionId ? sseTransports.get(sessionId) : undefined
    if (!transport) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    await transport.handlePostMessage(req, res, req.body)
  })

  return app
}
