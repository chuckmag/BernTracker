import type { Request, Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { createApp as createBaseApp, requireKeycloakAuth } from '@wodalytics/server'
import { createMcpServer } from './server.js'

export function createApp() {
  const app = createBaseApp()

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // RFC 9728 — OAuth 2.0 Protected Resource Metadata.
  // Per RFC 9728 §5, clients construct the metadata URL by appending the
  // resource path to /.well-known/oauth-protected-resource. For our resource
  // https://mcp.qa.wodalytics.com/mcp the canonical URL is
  // /.well-known/oauth-protected-resource/mcp. We also serve the root form as
  // a fallback for clients that try both.
  function protectedResourceMetadata(req: Request, res: Response): void {
    const issuer = process.env.KEYCLOAK_ISSUER_URL
    if (!issuer) {
      res.status(503).json({ error: 'Authorization server not configured' })
      return
    }
    const resource = process.env.MCP_PUBLIC_URL ?? `https://${req.hostname}`
    res.json({
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [
        'openid',
        'wodalytics:workouts:read',
        'wodalytics:results:read',
        'wodalytics:results:write',
        'wodalytics:programs:write',
      ],
    })
  }

  app.get('/.well-known/oauth-protected-resource', protectedResourceMetadata)
  app.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata)

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
  app.post('/mcp', requireKeycloakAuth, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    const server = createMcpServer(req.user?.id)
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

    const server = createMcpServer(req.user?.id)
    // connect() calls transport.start() internally — do not call start() again
    await server.connect(transport)
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

  return app
}
