import type { Request, Response, NextFunction } from 'express'
import { createLogger } from './logger.js'

const request = createLogger('request')
const response = createLogger('response')

function mcpLabel(req: Request): string {
  if (req.method !== 'POST' || req.path !== '/mcp' || !req.body) return ''
  const method = req.body.method
  if (typeof method !== 'string') return ''
  if (method === 'tools/call') {
    const tool = req.body.params?.name
    return ` method=${method}${typeof tool === 'string' ? ` tool=${tool}` : ''}`
  }
  return ` method=${method}`
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID()
  const start = Date.now()

  request.info(req, `${req.method} ${req.path}${mcpLabel(req)} —`)

  res.on('finish', () => {
    const elapsed = Date.now() - start
    response.info(req, `${req.method} ${req.path} ${res.statusCode} ${elapsed}ms —`)
  })

  next()
}
