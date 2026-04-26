import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { prisma } from '@wodalytics/db'
import { authRouter } from './routes/auth.js'
import gymsRouter from './routes/gyms'
import programsRouter from './routes/programs'
import workoutsRouter from './routes/workouts'
import resultsRouter from './routes/results'
import namedWorkoutsRouter from './routes/namedWorkouts'
import movementsRouter from './routes/movements'
import { createLogger } from './lib/logger.js'
import { requestLogger } from './middleware/requestLogger.js'

// ── Process-level error handlers ─────────────────────────────────────────────
// Catch any exception or promise rejection that escapes Express (e.g. an async
// route handler that throws without try/catch in Express 4). These prevent the
// process from crashing on intermittent errors like DB connection failures.
const logProcess = createLogger('process')

process.on('uncaughtException', (err) => {
  logProcess.error(`uncaughtException: ${err.message}`, err)
})

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason)
  logProcess.error(`unhandledRejection: ${message}`, reason)
})
// ─────────────────────────────────────────────────────────────────────────────

const app = express()
// API_PORT is preferred so a worktree can pick its own port without colliding
// with `PORT`, which other tooling (Railway, Docker Compose) sets to 3000.
const port = process.env.API_PORT ?? process.env.PORT ?? 3000

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use(requestLogger)

app.use('/api/auth', authRouter)

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ok', timestamp: new Date() })
})

app.use('/api', gymsRouter)
app.use('/api', programsRouter)
app.use('/api', workoutsRouter)
app.use('/api', resultsRouter)
app.use('/api', namedWorkoutsRouter)
app.use('/api', movementsRouter)

const logError = createLogger('error')

// Global error handler — catches any unhandled exception thrown from route handlers or middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)
  logError.error(req, `${req.method} ${req.path} — ${message}`, err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`)
})
