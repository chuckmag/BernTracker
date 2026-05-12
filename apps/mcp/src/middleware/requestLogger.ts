import type { Request, Response, NextFunction } from 'express'
import { createLogger } from '../lib/logger.js'

const request = createLogger('request')
const response = createLogger('response')

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID()
  const start = Date.now()

  request.info(req, `${req.method} ${req.path} —`)

  res.on('finish', () => {
    const elapsed = Date.now() - start
    response.info(req, `${req.method} ${req.path} ${res.statusCode} ${elapsed}ms —`)
  })

  next()
}
