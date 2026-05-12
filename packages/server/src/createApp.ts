import express from 'express'
import { requestLogger } from './requestLogger.js'

/**
 * Returns a baseline Express app with JSON body parsing and request logging
 * wired in. Services mount their own routes and apply their own CORS/auth on
 * top of the returned instance.
 */
export function createApp(): express.Express {
  const app = express()
  app.use(express.json())
  app.use(requestLogger)
  return app
}
